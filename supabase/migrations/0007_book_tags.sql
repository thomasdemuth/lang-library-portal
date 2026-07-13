-- Category tags for individual books, keyed by the content-derived
-- dedupe_key (i13:<isbn13> / i10:<isbn10> / ta:<title|creators>) so tags
-- survive Libib re-imports, which replace every row in `books`.
-- Categories mirror lib/categories.ts (the map/sign-maker palette).
create table book_tags (
  book_key text primary key,
  category text not null check (category in ('fiction','comics','nonfiction','young','drama','other')),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);
