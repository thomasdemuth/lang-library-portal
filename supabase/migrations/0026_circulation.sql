-- 0026_circulation.sql — book checkouts + a small site-settings store.
-- Idempotent and non-destructive; the app degrades gracefully until it runs
-- (checkout buttons say the feature unlocks after the next library update).

-- Checkouts are keyed by the book's dedupe_key (like reading_log/favorites),
-- NOT by books.id: inventory is generational and ids are replaced on every
-- Libib import, while dedupe_key survives. Title/isbn13 are snapshots so a
-- checkout stays legible even if the book later leaves the catalog.
create table if not exists checkouts (
  id bigint generated always as identity primary key,
  book_key text not null,
  title text not null,
  isbn13 text,
  -- Who has the book. Always a student (or staff) email.
  student_email text not null,
  -- Who performed the checkout: the student themself, or a teacher/admin
  -- checking a book out on a student's behalf.
  checked_out_by text not null,
  checked_out_via text not null default 'student'
    check (checked_out_via in ('student', 'staff', 'admin')),
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Return state. NULL returned_at = the book is still out.
  returned_at timestamptz,
  returned_by text
);

-- The circulation tab reads open checkouts constantly; "my books" is per email.
create index if not exists checkouts_open on checkouts (created_at desc) where returned_at is null;
create index if not exists checkouts_student on checkouts (student_email, returned_at, created_at desc);
create index if not exists checkouts_book_open on checkouts (book_key) where returned_at is null;

-- One open checkout per student per book — checking out again while the first
-- is unreturned is a mistake, not a second copy.
create unique index if not exists checkouts_one_open
  on checkouts (student_email, book_key) where returned_at is null;

-- Key→value site settings (first use: how circulation emails are sent).
-- jsonb values so future settings aren't forced through text.
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

-- Same defense-in-depth as 0002: the app uses the service key only.
alter table checkouts enable row level security;
alter table site_settings enable row level security;
