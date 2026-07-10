-- Lang Library portal — full schema.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- The app talks to this database ONLY with the service-role key from the
-- server; the anon key is never shipped, so no RLS policies are needed.

create extension if not exists pg_trgm;

-- ── Admins & invites ────────────────────────────────────────────────────

create table admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  name text not null,
  password_hash text not null,
  notify_requests boolean not null default true,
  session_v integer not null default 1,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  created_by uuid references admins(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references admins(id),
  revoked_at timestamptz
);

-- Atomically consume an invite and create the admin (single-use, race-safe).
create or replace function claim_invite(
  p_token_hash text,
  p_username text,
  p_email text,
  p_name text,
  p_password_hash text
) returns table (id uuid, username text, email text, name text, session_v integer)
language plpgsql as $$
declare
  v_invite uuid;
  v_admin admins%rowtype;
begin
  update invite_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.used_at is null
     and t.revoked_at is null
     and t.expires_at > now()
  returning t.id into v_invite;

  if v_invite is null then
    raise exception 'invalid_invite';
  end if;

  begin
    insert into admins (username, email, name, password_hash)
    values (lower(p_username), lower(p_email), p_name, p_password_hash)
    returning * into v_admin;
  exception when unique_violation then
    raise exception 'taken';
  end;

  update invite_tokens set used_by = v_admin.id where invite_tokens.id = v_invite;

  return query select v_admin.id, v_admin.username, v_admin.email, v_admin.name, v_admin.session_v;
end;
$$;

-- ── Rate limiting ───────────────────────────────────────────────────────

create table rate_limit_hits (
  id bigint generated always as identity primary key,
  kind text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_hits_lookup on rate_limit_hits (kind, identifier, created_at);

-- Records a hit and returns true if the caller is still within the limit.
create or replace function hit_rate_limit(
  p_kind text, p_identifier text, p_max integer, p_window_secs integer
) returns boolean language plpgsql as $$
declare v_count bigint;
begin
  insert into rate_limit_hits (kind, identifier) values (p_kind, p_identifier);
  select count(*) into v_count
    from rate_limit_hits
   where kind = p_kind and identifier = p_identifier
     and created_at > now() - make_interval(secs => p_window_secs);
  return v_count <= p_max;
end;
$$;

-- ── Inventory (Libib CSV generations) ───────────────────────────────────

create table inventory_syncs (
  id bigint generated always as identity primary key,
  status text not null default 'pending' check (status in ('pending','active','aborted','superseded')),
  source_filename text,
  row_count integer,
  merged_count integer,
  started_by uuid references admins(id),
  started_at timestamptz not null default now(),
  activated_at timestamptz
);

create table books (
  id bigint generated always as identity primary key,
  sync_id bigint not null references inventory_syncs(id) on delete cascade,
  title text not null,
  creators text,
  isbn13 text,
  isbn10 text,
  publisher text,
  publish_date text,
  group_name text,
  tags text,
  item_type text,
  copies integer not null default 1 check (copies >= 0),
  title_norm text not null,
  creators_norm text,
  dedupe_key text not null,
  unique (sync_id, dedupe_key)
);
create index books_sync on books (sync_id);
create index books_title_trgm on books using gin (title_norm gin_trgm_ops);
create index books_creators_trgm on books using gin (creators_norm gin_trgm_ops);

-- Flip a pending sync live and drop every other generation, atomically.
create or replace function activate_sync(p_sync_id bigint) returns void
language plpgsql as $$
begin
  update inventory_syncs set status = 'superseded' where status = 'active';
  update inventory_syncs set status = 'active', activated_at = now()
   where id = p_sync_id and status = 'pending';
  if not found then
    raise exception 'sync_not_pending';
  end if;
  delete from books where sync_id <> p_sync_id;
end;
$$;

-- Candidate rows for the request matcher (active generation only).
create or replace function match_candidates(p_title_norm text)
returns setof books language sql stable as $$
  with active as (
    select id from inventory_syncs where status = 'active' limit 1
  )
  select * from (
    select b.* from books b, active a where b.sync_id = a.id and b.title_norm = p_title_norm
    union
    select * from (
      select b.* from books b, active a
       where b.sync_id = a.id and b.title_norm like p_title_norm || '%'
       limit 15
    ) pre
    union
    select * from (
      select b.* from books b, active a
       where b.sync_id = a.id and b.title_norm like '%' || p_title_norm || '%'
       limit 15
    ) mid
    union
    select * from (
      select b.* from books b, active a
       where b.sync_id = a.id and similarity(b.title_norm, p_title_norm) > 0.3
       order by similarity(b.title_norm, p_title_norm) desc
       limit 15
    ) fuzzy
  ) u
  limit 40;
$$;

-- ── Book requests ───────────────────────────────────────────────────────

create table book_requests (
  id bigint generated always as identity primary key,
  requester_email text not null,
  requester_name text,
  title text not null,
  author text,
  copies_requested integer not null check (copies_requested >= 1),
  needed_by date,
  notes text,
  match_status text check (match_status in ('found','insufficient','not_found')),
  matched_title text,
  matched_copies integer,
  match_candidates jsonb,
  status text not null default 'new' check (status in ('new','in_progress','ordered','ready','declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz,
  status_updated_by uuid references admins(id),
  reminder_sent_at timestamptz
);
create index book_requests_queue on book_requests (status, created_at desc);
create index book_requests_mine on book_requests (requester_email, created_at desc);
create index book_requests_reminder on book_requests (created_at)
  where status = 'new' and reminder_sent_at is null;

-- ── Library map ─────────────────────────────────────────────────────────

create table shelves (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null check (category in ('fiction','comics','nonfiction','young','drama','other')),
  letter_range text,
  details_public text,
  notes_internal text,
  x double precision not null,
  y double precision not null,
  w double precision not null,
  h double precision not null,
  rotation double precision not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

create table map_settings (
  id integer primary key check (id = 1),
  floorplan_path text,
  floorplan_width integer,
  floorplan_height integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);
insert into map_settings (id) values (1);

-- ── Feedback ────────────────────────────────────────────────────────────

create table feedback (
  id bigint generated always as identity primary key,
  audience text not null check (audience in ('student','staff')),
  email text not null,
  name text,
  message text not null check (char_length(message) between 3 and 4000),
  status text not null default 'new' check (status in ('new','read','archived')),
  handled_by uuid references admins(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_queue on feedback (status, created_at desc);

-- ── Usage analytics ─────────────────────────────────────────────────────

create table usage_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  audience text not null,
  role text not null,
  path text not null,
  visitor_id uuid
);
create index usage_events_ts on usage_events (ts);

create or replace function usage_summary(p_from date, p_to date)
returns table (day date, audience text, role text, views bigint, uniques bigint)
language sql stable as $$
  select ts::date as day, audience, role,
         count(*)::bigint as views,
         count(distinct visitor_id)::bigint as uniques
    from usage_events
   where ts >= p_from and ts < p_to + 1
   group by 1, 2, 3
   order by 1;
$$;

create or replace function usage_top_paths(p_from date, p_to date, p_limit integer)
returns table (path text, audience text, views bigint)
language sql stable as $$
  select path, audience, count(*)::bigint as views
    from usage_events
   where ts >= p_from and ts < p_to + 1
   group by 1, 2
   order by views desc
   limit p_limit;
$$;
