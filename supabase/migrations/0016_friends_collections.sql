-- Friends + custom collections (student-built book lists).
-- Idempotent: safe to run standalone after 0012.

-- One-way friend list ("my friends"); resolved via public_id in the API so
-- emails are never exposed to other students.
create table if not exists friends (
  id bigint generated always as identity primary key,
  email text not null,
  friend_email text not null,
  created_at timestamptz not null default now(),
  unique (email, friend_email),
  check (email <> friend_email)
);
create index if not exists friends_email on friends (email, created_at desc);

-- Named collections a student curates (like playlists for books).
create table if not exists collections (
  id bigint generated always as identity primary key,
  email text not null,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists collections_email on collections (email, created_at desc);

create table if not exists collection_books (
  id bigint generated always as identity primary key,
  collection_id bigint not null references collections(id) on delete cascade,
  book_key text not null,
  title text not null,
  isbn13 text,
  created_at timestamptz not null default now(),
  unique (collection_id, book_key)
);
create index if not exists collection_books_cid on collection_books (collection_id, created_at);
