-- 0023_admin_ops.sql — admin password resets + New-York analytics days.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- 1. Password reset links ride the existing invite machinery: same table,
--    same hash-only storage, same single-use consumption. A `kind` column
--    tells the two apart, and `target_admin` pins a reset to the account
--    whose password it may change. `claim_invite` is re-created to consume
--    ONLY kind='invite' rows, so a reset link can never mint a new admin.
-- 2. `usage_summary` / `usage_top_paths` bucketed days in UTC while the rest
--    of the app thinks in America/New_York — evening traffic (after 7/8pm ET)
--    landed on the next calendar day. Both are re-created to bucket via
--    (ts at time zone 'America/New_York')::date. Signatures and result
--    shapes are unchanged.

-- ── Reset links on invite_tokens ────────────────────────────────────────

alter table invite_tokens add column if not exists kind text not null default 'invite'
  check (kind in ('invite', 'reset'));
alter table invite_tokens add column if not exists target_admin uuid references admins(id);

-- Claiming an invite creates a NEW admin — reset tokens must never qualify.
create or replace function claim_invite(
  p_token_hash text,
  p_username text,
  p_email text,
  p_name text,
  p_password_hash text
) returns table (id uuid, username text, email text, name text, session_v integer)
language plpgsql as $$
declare
  v_invite invite_tokens%rowtype;
  v_admin admins%rowtype;
begin
  update invite_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.kind = 'invite'
     and t.used_at is null
     and t.revoked_at is null
     and t.expires_at > now()
  returning t.* into v_invite;

  if v_invite.id is null then
    raise exception 'invalid_invite';
  end if;

  begin
    insert into admins (username, email, name, password_hash, role, permissions)
    values (
      lower(p_username), lower(p_email), p_name, p_password_hash,
      coalesce(v_invite.role, 'admin'), coalesce(v_invite.permissions, '{}'::jsonb)
    )
    returning * into v_admin;
  exception when unique_violation then
    raise exception 'taken';
  end;

  update invite_tokens set used_by = v_admin.id where invite_tokens.id = v_invite.id;

  return query select v_admin.id, v_admin.username, v_admin.email, v_admin.name, v_admin.session_v;
end;
$$;

-- Atomically consume a reset token and set the EXISTING admin's password.
-- Bumping session_v revokes every session that admin had (matching the
-- change-password flow); the claiming browser gets a fresh session from the
-- API route. Disabled or self-deleted accounts can't be reset back to life.
create or replace function claim_password_reset(
  p_token_hash text,
  p_password_hash text
) returns table (id uuid, username text, email text, name text, session_v integer)
language plpgsql as $$
declare
  v_invite invite_tokens%rowtype;
  v_admin admins%rowtype;
begin
  update invite_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.kind = 'reset'
     and t.used_at is null
     and t.revoked_at is null
     and t.expires_at > now()
  returning t.* into v_invite;

  if v_invite.id is null or v_invite.target_admin is null then
    raise exception 'invalid_invite';
  end if;

  update admins a
     set password_hash = p_password_hash,
         session_v = a.session_v + 1
   where a.id = v_invite.target_admin
     and a.disabled_at is null
     and a.deleted_at is null
  returning * into v_admin;

  if v_admin.id is null then
    raise exception 'invalid_invite';
  end if;

  update invite_tokens set used_by = v_admin.id where invite_tokens.id = v_invite.id;

  return query select v_admin.id, v_admin.username, v_admin.email, v_admin.name, v_admin.session_v;
end;
$$;

grant execute on function claim_password_reset(text, text) to service_role;

-- ── Analytics: bucket days in the library's timezone ────────────────────

create or replace function usage_summary(p_from date, p_to date)
returns table (day date, audience text, role text, views bigint, uniques bigint)
language sql stable as $$
  select (ts at time zone 'America/New_York')::date as day, audience, role,
         count(*)::bigint as views,
         count(distinct visitor_id)::bigint as uniques
    from usage_events
   where (ts at time zone 'America/New_York')::date between p_from and p_to
   group by 1, 2, 3
   order by 1;
$$;

create or replace function usage_top_paths(p_from date, p_to date, p_limit integer)
returns table (path text, audience text, views bigint)
language sql stable as $$
  select path, audience, count(*)::bigint as views
    from usage_events
   where (ts at time zone 'America/New_York')::date between p_from and p_to
   group by 1, 2
   order by views desc
   limit p_limit;
$$;
