-- 0026_teacher_books.sql — the Teachers tag: books kept out of the students'
-- library. Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- Some of the collection is for teachers: classroom sets, professional
-- reading, answer keys. Those books are in the room, they're on the map, and
-- teachers need to find them — but they should not turn up when a student
-- searches, browses, or asks where a book is.
--
-- Teachers is deliberately NOT another value of `category`. A book is still
-- Fiction or Non-Fiction; being for teachers is a separate fact about who may
-- see it, so it rides alongside the category rather than replacing it. That
-- means `category` has to become optional: a staff-room title may be marked
-- for teachers without anyone having decided what shelf category it is.
--
-- Two consequences worth stating:
--   * A teacher book is invisible to students everywhere the catalog is read
--     (search, the home rows, book details, "show me where"). It is NOT
--     retroactively scrubbed from a student's reading log or favorites —
--     nothing already in someone's own record gets deleted underneath them.
--   * `teachers` also becomes a map area type, so the physical shelf can be
--     drawn in dark silver. That area shows on every map, students included:
--     the shelf is really there, and a map that omitted it would send a
--     student looking for a wall that has bookcases against it.

-- ── The flag ────────────────────────────────────────────────────────────

alter table book_tags add column if not exists teachers boolean not null default false;

-- Marked for teachers with no category decided yet is a legitimate state.
alter table book_tags alter column category drop not null;
alter table book_tags drop constraint if exists book_tags_category_check;
alter table book_tags add constraint book_tags_category_check
  check (category is null or category in ('fiction','comics','nonfiction','young','drama','other'));

-- A row that says nothing is just clutter; the app deletes instead.
alter table book_tags drop constraint if exists book_tags_not_empty_check;
alter table book_tags add constraint book_tags_not_empty_check
  check (category is not null or teachers);

-- Listing the teacher collection is a small slice of a big table.
create index if not exists book_tags_teachers on book_tags (book_key) where teachers;

-- ── The view the catalog filters through ────────────────────────────────

create or replace view books_tagged as
select b.*, t.category as tag, coalesce(t.teachers, false) as teachers
from books b
left join book_tags t on t.book_key = b.dedupe_key;

-- ── Search, with the audience rule pushed into the query ────────────────
--
-- Filtering after the fact would corrupt the page counts and the "N results"
-- total, so who-may-see-this belongs in the same query that paginates.
-- p_hide_teachers → students and guests; p_teachers_only → the Books for
-- Teachers surfaces. Dropped first because the argument list is changing:
-- create-or-replace would leave the old signature behind as an overload.

drop function if exists search_books(text, text, bigint, text, boolean, int, int);
drop function if exists search_books(text, text, bigint, text, boolean, boolean, boolean, int, int);

create function search_books(
  p_q text,
  p_qnorm text,
  p_sync_id bigint,
  p_tag text default null,
  p_untagged boolean default false,
  p_hide_teachers boolean default false,
  p_teachers_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id bigint,
  title text,
  creators text,
  isbn13 text,
  copies integer,
  group_name text,
  dedupe_key text,
  tag text,
  teachers boolean,
  total_count bigint
)
language sql
stable
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with params as (
    select coalesce(p_qnorm, '') as qn,
           websearch_to_tsquery('english', coalesce(p_q, '')) as tsq
  ),
  scored as (
    select
      b.id, b.title, b.creators, b.isbn13, b.copies, b.group_name, b.dedupe_key,
      bt.category as tag,
      coalesce(bt.teachers, false) as teachers,
      greatest(
        case when b.search_tsv @@ p.tsq then ts_rank(b.search_tsv, p.tsq) * 4.0 else 0 end,
        case when b.title_norm like p.qn || '%' then 3.0 else 0 end,
        case when b.title_norm ilike '%' || p.qn || '%' then 2.0 else 0 end,
        word_similarity(p.qn, b.title_norm) * 1.5,
        word_similarity(p.qn, coalesce(b.creators_norm, '')) * 1.2
      ) as score
    from books b
    cross join params p
    left join book_tags bt on bt.book_key = b.dedupe_key
    where b.sync_id = p_sync_id
      and (p_tag is null or bt.category = p_tag)
      and (not p_untagged or bt.category is null)
      and (not p_hide_teachers or not coalesce(bt.teachers, false))
      and (not p_teachers_only or coalesce(bt.teachers, false))
      and (
        b.search_tsv @@ p.tsq
        or b.title_norm ilike '%' || p.qn || '%'
        or coalesce(b.creators_norm, '') ilike '%' || p.qn || '%'
        or p.qn <% b.title_norm
        or p.qn <% coalesce(b.creators_norm, '')
      )
  )
  select id, title, creators, isbn13, copies, group_name, dedupe_key, tag, teachers,
         count(*) over() as total_count
  from scored
  order by score desc, title asc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0)
$$;

grant execute on function search_books(text, text, bigint, text, boolean, boolean, boolean, int, int) to service_role;

-- ── The shelf ───────────────────────────────────────────────────────────

-- A Teachers area on the map, dark silver. Like 'games' this is a map-only
-- type: 'teachers' is never a book *category* — a book carries the flag
-- instead, so it can be Fiction and for teachers at the same time.
alter table shelves drop constraint if exists shelves_category_check;
alter table shelves add constraint shelves_category_check
  check (category in ('fiction', 'comics', 'nonfiction', 'young', 'drama', 'other', 'games', 'teachers'));
