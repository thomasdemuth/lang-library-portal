-- Book descriptions and internal notes, straight from the Libib export
-- (its `description` and `notes` columns were previously dropped at
-- import). Shown when a catalog row is expanded; populated by the next
-- import. books_tagged must be rebuilt so b.* picks up the new columns
-- (replace can't reorder, so drop + create).
alter table books add column if not exists description text;
alter table books add column if not exists notes text;

drop view if exists books_tagged;
create view books_tagged as
select b.*, t.category as tag
from books b
left join book_tags t on t.book_key = b.dedupe_key;
