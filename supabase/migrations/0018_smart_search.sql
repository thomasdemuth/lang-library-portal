-- 0018_smart_search.sql — fuzzy + full-text catalog/games search.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- Adds trigram (typo-tolerant) + full-text (word-order / partial) search over
-- books and games, exposed as PostgREST RPCs search_books()/search_games().
-- The app falls back to the old substring search until this has run.

create extension if not exists pg_trgm;

-- ── Books ────────────────────────────────────────────────────────────────
-- Full-text vector over title + creators (english config → stems plurals,
-- drops stopwords, ignores word order). Generated + stored so it stays in
-- sync automatically. to_tsvector(regconfig, text) is immutable → OK stored.
alter table books
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(creators, ''))
  ) stored;

create index if not exists books_search_tsv_idx on books using gin (search_tsv);
create index if not exists books_title_norm_trgm on books using gin (title_norm gin_trgm_ops);
create index if not exists books_creators_norm_trgm on books using gin (creators_norm gin_trgm_ops);

-- p_q       = the raw query (used for full-text)
-- p_qnorm   = the app-normalized query (lowercased, accent-stripped, [a-z0-9 ],
--             leading article dropped) — same shape as title_norm/creators_norm
-- Ranking prefers exact/token/prefix hits over fuzzy ones. The function-level
-- SET lowers the word-similarity threshold (default 0.6 → 0.4) for more typo
-- tolerance while still using the trigram GIN index via the <% operator.
create or replace function search_books(
  p_q text,
  p_qnorm text,
  p_sync_id bigint,
  p_tag text default null,
  p_untagged boolean default false,
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
      and (
        b.search_tsv @@ p.tsq
        or b.title_norm ilike '%' || p.qn || '%'
        or coalesce(b.creators_norm, '') ilike '%' || p.qn || '%'
        or p.qn <% b.title_norm
        or p.qn <% coalesce(b.creators_norm, '')
      )
  )
  select id, title, creators, isbn13, copies, group_name, dedupe_key, tag,
         count(*) over() as total_count
  from scored
  order by score desc, title asc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0)
$$;

-- ── Games ────────────────────────────────────────────────────────────────
alter table games
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

create index if not exists games_search_tsv_idx on games using gin (search_tsv);
create index if not exists games_title_norm_trgm on games using gin (title_norm gin_trgm_ops);

create or replace function search_games(
  p_q text,
  p_qnorm text,
  p_subcategory text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns table (
  id bigint,
  title text,
  subcategory text,
  description text,
  image_url text,
  copies integer,
  condition text,
  location text,
  available boolean,
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
      g.id, g.title, g.subcategory, g.description, g.image_url, g.copies,
      g.condition, g.location, g.available,
      greatest(
        case when g.search_tsv @@ p.tsq then ts_rank(g.search_tsv, p.tsq) * 4.0 else 0 end,
        case when g.title_norm like p.qn || '%' then 3.0 else 0 end,
        case when g.title_norm ilike '%' || p.qn || '%' then 2.0 else 0 end,
        word_similarity(p.qn, g.title_norm) * 1.5
      ) as score
    from games g
    cross join params p
    where (p_subcategory is null or g.subcategory = p_subcategory)
      and (
        g.search_tsv @@ p.tsq
        or g.title_norm ilike '%' || p.qn || '%'
        or p.qn <% g.title_norm
      )
  )
  select id, title, subcategory, description, image_url, copies, condition,
         location, available, count(*) over() as total_count
  from scored
  order by score desc, title asc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0)
$$;

-- Let the API's service role call them.
grant execute on function search_books(text, text, bigint, text, boolean, int, int) to service_role;
grant execute on function search_games(text, text, text, int, int) to service_role;
