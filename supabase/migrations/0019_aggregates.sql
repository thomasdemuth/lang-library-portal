-- 0019_aggregates.sql — push per-email / per-book counting into the database.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- Four read-only aggregate RPCs that replace API routes which used to pull
-- thousands of raw rows and tally them in JavaScript (friends read counts,
-- "class favorites", and the User Insights account lists). Every caller keeps
-- its old JS-aggregation path and falls back to it until this has run.
--
-- All four are plain `language sql stable` (invoker rights, like 0018): the
-- API talks to Postgres only with the service-role key and there is no RLS on
-- these tables, so security definer would add risk without adding reach.

-- The staff roster groups usage_events by email within role = 'staff';
-- usage_events_email (0013) only covers (email, ts).
create index if not exists usage_events_role_email on usage_events (role, email, ts desc);

-- ── Friends: books logged per email ──────────────────────────────────────
-- Replaces "fetch up to 5,000 reading_log rows for these emails and count in
-- JS". Emails not present in reading_log are simply absent from the result
-- (the caller defaults them to 0), so the row count is bounded by the input.
create or replace function read_counts(p_emails text[])
returns table (email text, reads bigint)
language sql
stable
as $$
  select rl.email, count(*)::bigint
    from reading_log rl
   where rl.email = any (coalesce(p_emails, '{}'::text[]))
   group by rl.email
$$;

-- ── Class favorites: most-hearted books ──────────────────────────────────
-- Replaces "fetch 2,000 favorites rows and count in JS", which silently
-- undercounted (and mis-ranked) once the table grew past the cap. Ties break
-- on book_key so the row is stable between requests.
create or replace function top_loved(p_limit int default 14)
returns table (book_key text, favs bigint)
language sql
stable
as $$
  select f.book_key, count(*)::bigint
    from favorites f
   group by f.book_key
   order by count(*) desc, f.book_key asc
   limit greatest(coalesce(p_limit, 0), 0)
$$;

-- ── User Insights: one pass for every account's activity ─────────────────
-- Replaces four separate scans (5,000-row slices of reading_log / favorites /
-- account_notes plus a 4,000-row usage_events scan for last-seen). One row per
-- email that has ANY activity — bounded by the number of accounts, not by the
-- number of events. Accounts with no activity at all don't appear; callers
-- default them (0 / 0 / 0 / null), exactly as the JS maps did.
create or replace function admin_user_stats()
returns table (email text, reads bigint, favs bigint, notes bigint, last_seen timestamptz)
language sql
stable
as $$
  with r as (
    select rl.email as em, count(*)::bigint as n from reading_log rl group by rl.email
  ),
  f as (
    select fv.email as em, count(*)::bigint as n from favorites fv group by fv.email
  ),
  nt as (
    select an.email as em, count(*)::bigint as n from account_notes an group by an.email
  ),
  s as (
    select ue.email as em, max(ue.ts) as seen
      from usage_events ue
     where ue.email is not null
     group by ue.email
  ),
  keys as (
    select em from r union
    select em from f union
    select em from nt union
    select em from s
  )
  select k.em,
         coalesce(r.n, 0),
         coalesce(f.n, 0),
         coalesce(nt.n, 0),
         s.seen
    from keys k
    left join r on r.em = k.em
    left join f on f.em = k.em
    left join nt on nt.em = k.em
    left join s on s.em = k.em
$$;

-- ── User Insights: the teacher roster ────────────────────────────────────
-- Teachers are "anyone seen on the staff site, plus anyone who filed a book
-- request". The old code unioned a 3,000-row book_requests fetch with an
-- UNORDERED 4,000-row usage_events fetch, so which teachers survived the cap
-- was non-deterministic. Here the cap falls on the least recently active.
-- last_seen is deliberately NOT returned: the route's "last seen" is the
-- account's most recent view in ANY role and comes from admin_user_stats().
create or replace function staff_roster(p_limit int default 2000)
returns table (email text, requests bigint, last_request timestamptz)
language sql
stable
as $$
  with req as (
    select br.requester_email as em,
           count(*)::bigint as n,
           max(br.created_at) as last_req
      from book_requests br
     where br.requester_email is not null
     group by br.requester_email
  ),
  views as (
    select ue.email as em, max(ue.ts) as seen
      from usage_events ue
     where ue.role = 'staff' and ue.email is not null
     group by ue.email
  ),
  keys as (
    select em from req union
    select em from views
  )
  select k.em, coalesce(req.n, 0), req.last_req
    from keys k
    left join req on req.em = k.em
    left join views on views.em = k.em
   order by greatest(
              coalesce(views.seen, '-infinity'::timestamptz),
              coalesce(req.last_req, '-infinity'::timestamptz)
            ) desc,
            k.em asc
   limit greatest(coalesce(p_limit, 0), 0)
$$;

-- Let the API's service role call them.
grant execute on function read_counts(text[]) to service_role;
grant execute on function top_loved(int) to service_role;
grant execute on function admin_user_stats() to service_role;
grant execute on function staff_roster(int) to service_role;

comment on function read_counts(text[]) is 'Books logged per email, for the friends list (0019).';
comment on function top_loved(int) is 'Most-hearted book_keys, for the "class favorites" shelf row (0019).';
comment on function admin_user_stats() is 'Per-account reads/favorites/notes/last-seen for User Insights (0019).';
comment on function staff_roster(int) is 'Teacher roster (staff views + requesters), newest activity first (0019).';
