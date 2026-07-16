-- A precomputed "last name, first name" sort key for each book, so the
-- admin inventory and the tag-review queue can order by author. Populated
-- at import (and by the one-click re-index for the current generation).
alter table books add column if not exists author_sort text;
create index if not exists books_author_sort on books (sync_id, author_sort);

-- Bulk-set author_sort from a [{id, author_sort}, …] payload — lets the
-- re-index endpoint update the whole current generation in a few calls
-- (books.id is GENERATED ALWAYS, so a plain upsert can't do this).
create or replace function set_author_sorts(p jsonb) returns integer language sql as $$
  with updated as (
    update books b
    set author_sort = x.author_sort
    from jsonb_to_recordset(p) as x(id bigint, author_sort text)
    where b.id = x.id
    returning 1
  )
  select count(*)::int from updated;
$$;
