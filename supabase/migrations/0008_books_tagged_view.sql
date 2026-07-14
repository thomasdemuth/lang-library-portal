-- Books joined with their category tags, so the catalog can be FILTERED
-- by tag server-side (PostgREST can't join tables without a foreign key,
-- and book_tags is deliberately keyed by content, not by row id).
create or replace view books_tagged as
select b.*, t.category as tag
from books b
left join book_tags t on t.book_key = b.dedupe_key;
