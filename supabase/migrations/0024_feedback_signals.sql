-- 0024_feedback_signals.sql — structured feedback + anonymous QR submissions.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- The relaunch (new website + re-done physical library) needs feedback that is
-- measurable, not just a free-text inbox, and it has to be collectable from a
-- poster on a shelf where nobody is signed in. Three things follow:
--
-- 1. New signal columns. `rating` (1-5 stars) and `tags` (the quick-pick chips)
--    are what most submissions will consist of; `topic` says whether it is
--    about the website or the physical library; `spot` records which QR poster
--    was scanned; `source` distinguishes the feedback page from the banner and
--    the QR codes. All are nullable/defaulted, so every existing row stays
--    valid and the old free-text form keeps writing exactly what it always did.
-- 2. `email` becomes nullable. A QR scan in the library is anonymous — there is
--    no session and we deliberately don't ask for one. (When the scanner does
--    happen to carry a session cookie, the app still fills the email in.)
-- 3. `message` becomes optional. Tapping a star and a chip is a complete
--    submission; requiring prose would defeat the point. The length check is
--    re-created to allow NULL and to accept a one-word answer.
--
-- The app tolerates this migration not having run yet: both feedback POST
-- routes retry with the original column set if the insert reports an unknown
-- column, so a deploy that lands before the SQL does keeps accepting feedback
-- (minus the new signals).

-- ── Signal columns ──────────────────────────────────────────────────────

alter table feedback add column if not exists rating smallint;
alter table feedback add column if not exists tags text[] not null default '{}';
alter table feedback add column if not exists topic text;
alter table feedback add column if not exists spot text;
alter table feedback add column if not exists source text not null default 'form';

alter table feedback drop constraint if exists feedback_rating_check;
alter table feedback add constraint feedback_rating_check
  check (rating is null or rating between 1 and 5);

alter table feedback drop constraint if exists feedback_topic_check;
alter table feedback add constraint feedback_topic_check
  check (topic is null or topic in ('website', 'library'));

alter table feedback drop constraint if exists feedback_source_check;
alter table feedback add constraint feedback_source_check
  check (source in ('form', 'banner', 'qr'));

-- ── Anonymous + star-only submissions ───────────────────────────────────

alter table feedback alter column email drop not null;

alter table feedback alter column message drop not null;
alter table feedback drop constraint if exists feedback_message_check;
alter table feedback add constraint feedback_message_check
  check (message is null or char_length(message) between 1 and 4000);

-- A submission has to say *something*: prose, a star, or a chip.
alter table feedback drop constraint if exists feedback_not_empty_check;
alter table feedback add constraint feedback_not_empty_check
  check (message is not null or rating is not null or cardinality(tags) > 0);

-- 'public' = an anonymous QR scan with no session behind it.
alter table feedback drop constraint if exists feedback_audience_check;
alter table feedback add constraint feedback_audience_check
  check (audience in ('student', 'staff', 'public'));

-- ── Triage index ────────────────────────────────────────────────────────

-- The management Feedback page filters by topic (Website / Library) alongside
-- the existing status filter; feedback_queue already covers status.
create index if not exists feedback_signals on feedback (topic, created_at desc);

-- ── Star summary ────────────────────────────────────────────────────────

-- Averaged in the database rather than in the API: PostgREST caps a plain
-- select at 1000 rows, which would quietly turn "average stars" into "average
-- of the most recent 1000". Same shape as usage_summary() in 0001.
create or replace function feedback_rating_stats()
returns table (topic text, n bigint, avg_rating numeric)
language sql stable as $$
  select topic,
         count(*)::bigint as n,
         round(avg(rating)::numeric, 1) as avg_rating
    from feedback
   where rating is not null and topic is not null
   group by topic;
$$;
