-- Student engagement: profiles with avatars & points, and a reading log.
-- Students are identified by their gate email (no accounts/passwords).
create table student_profiles (
  email text primary key,
  avatar jsonb not null default '{}'::jsonb,
  owned jsonb not null default '[]'::jsonb,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table reading_log (
  id bigint generated always as identity primary key,
  email text not null,
  book_key text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (email, book_key)
);
create index reading_log_email on reading_log (email, created_at desc);
