-- Two-tier admins: Chief Admin and Admin, with granular per-admin powers.
-- Chief has everything (incl. managing admins, invites, and deletions);
-- a regular Admin has only the powers toggled on in `permissions`.

alter table admins add column if not exists role text not null default 'admin'
  check (role in ('chief', 'admin'));
alter table admins add column if not exists permissions jsonb not null default '{}'::jsonb;

-- The founding admins become Chief (they created the library). New admins
-- created via invite get whatever role the Chief assigned on the invite.
update admins set role = 'chief';

-- Invites carry the role + starting permissions the Chief chose.
alter table invite_tokens add column if not exists role text not null default 'admin'
  check (role in ('chief', 'admin'));
alter table invite_tokens add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Claiming an invite applies its role + permissions to the new admin.
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
