-- User Insights: per-account activity, internal notes, and profile privacy.
-- Idempotent, and safe to run in one go with 0012 (or standalone after it).

-- Page views gain the signed-in email (nullable; anonymous views stay null)
alter table usage_events add column if not exists email text;
create index if not exists usage_events_email on usage_events (email, ts desc);

-- Internal admin-only notes on any account (student or teacher), a thread
create table if not exists account_notes (
  id bigint generated always as identity primary key,
  email text not null,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists account_notes_email on account_notes (email, created_at desc);

-- Profile privacy: hidden profiles are excluded from the leaderboard and
-- their public page 404s. Settable by the student or by an admin (moderation).
alter table student_profiles add column if not exists hidden boolean not null default false;
