-- Games: a top-level inventory kept entirely separate from books, plus a
-- "games" map area type. Idempotent and non-destructive — existing book,
-- shelf, and student data are untouched.

create table if not exists games (
  id bigint generated always as identity primary key,
  title text not null,
  subcategory text not null default 'other'
    check (subcategory in ('card', 'board', 'word', 'other')),
  description text,
  image_url text,
  copies integer not null default 1 check (copies >= 0),
  condition text,
  location text,
  available boolean not null default true,
  title_norm text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);
create index if not exists games_subcategory on games (subcategory, title_norm);
create index if not exists games_title_norm on games (title_norm);

-- Let map shelves be tagged as a Games area (rendered grass-green). "games"
-- is a MAP category only — never a book tag — so books and games stay fully
-- separate everywhere else.
alter table shelves drop constraint if exists shelves_category_check;
alter table shelves add constraint shelves_category_check
  check (category in ('fiction', 'comics', 'nonfiction', 'young', 'drama', 'other', 'games'));
