-- Favorites + public student pages.
-- Idempotent: safe to run whether or not 0011 has been applied — it
-- (re)creates the play tables with IF NOT EXISTS, then adds what's new.

create table if not exists student_profiles (
  email text primary key,
  avatar jsonb not null default '{}'::jsonb,
  owned jsonb not null default '[]'::jsonb,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists reading_log (
  id bigint generated always as identity primary key,
  email text not null,
  book_key text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (email, book_key)
);
create index if not exists reading_log_email on reading_log (email, created_at desc);

-- A stable, non-guessable id so students can share/visit each other's pages
-- without ever exposing an email address.
alter table student_profiles
  add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists student_profiles_public_id on student_profiles (public_id);

create table if not exists favorites (
  id bigint generated always as identity primary key,
  email text not null,
  book_key text not null,
  title text not null,
  isbn13 text,
  created_at timestamptz not null default now(),
  unique (email, book_key)
);
create index if not exists favorites_email on favorites (email, created_at desc);
create index if not exists favorites_book on favorites (book_key);
