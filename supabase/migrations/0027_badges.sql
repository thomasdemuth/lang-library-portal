-- 0027_badges.sql — the student badge ledger + the one-time welcome.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- Badges themselves are DERIVED in code (lib/badges.ts) from the reading log,
-- favorites, lists, genres, checkouts and friends a student already has. This
-- table stores only WHEN each badge was earned and whether its celebration has
-- been shown — so the badge list stays editable in code, and a badge added
-- next term is awarded retroactively to everyone who already qualifies.
--
-- Why a table instead of localStorage: the Take-a-Book-Home kiosk is a shared
-- school computer. A per-browser ledger would be shared by every student who
-- uses that kiosk, and a badge earned there would celebrate all over again on
-- the student's own laptop. This celebrates exactly once, anywhere.
--
-- The ledger is APPEND-ONLY on purpose. Undoing a logged read never takes a
-- badge back — nothing in the student experience is allowed to feel like a
-- loss.
create table if not exists student_badges (
  id bigint generated always as identity primary key,
  email text not null,
  slug text not null,
  earned_at timestamptz not null default now(),
  -- null = earned but not yet celebrated; the pop-up fires on the next load.
  seen_at timestamptz,
  unique (email, slug)
);

create index if not exists student_badges_email on student_badges (email, earned_at desc);

-- Same lockdown as every other student table (0002): the API reaches Postgres
-- only with the service-role key, and nothing else may read this.
alter table student_badges enable row level security;

-- The one-time "welcome to your library" moment, stamped on first dismissal.
alter table student_profiles add column if not exists welcomed_at timestamptz;

comment on table student_badges is 'Per-student badge ledger: when each derived badge was earned and celebrated (0027).';
comment on column student_profiles.welcomed_at is 'When the student dismissed the first-visit welcome (0027).';
