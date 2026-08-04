-- 0021_import_seatbelt.sql — keep the previous catalog generation around.
-- Run once in the Supabase SQL editor. Additive & idempotent.
--
-- Before this migration, activating a Libib import hard-deleted every other
-- generation of `books` in the same transaction — one unconfirmed click and
-- the old catalog (including titles added by hand since the last import) was
-- gone. Now activation only marks the old generation `superseded` and leaves
-- its rows in place for 30 days, so the import flow can show a diff preview
-- first and the previous catalog can be restored from Import history. The
-- daily cron calls prune_superseded_syncs(30) to delete generations whose
-- restore window has passed.
--
-- Every catalog read already filters books by the ACTIVE sync id (or via
-- match_candidates / search_books, which take it explicitly), so superseded
-- rows are invisible everywhere except the restore machinery.

-- When a generation was superseded / when its books were finally deleted.
-- A superseded sync is restorable while pruned_at is null (and its books
-- still exist). Rows superseded before this migration have superseded_at
-- null — their books were already deleted, so they are not restorable.
alter table inventory_syncs add column if not exists superseded_at timestamptz;
alter table inventory_syncs add column if not exists pruned_at timestamptz;

-- When each book row was inserted. Existing rows stay null (unknown age);
-- new rows stamp themselves. A live-generation row created AFTER its sync
-- was activated is a manual addition (scan / "Add a title"), which is how
-- the import preview warns about hand-added titles missing from the new CSV.
alter table books add column if not exists created_at timestamptz;
alter table books alter column created_at set default now();

-- Flip a pending sync live. The outgoing generation is no longer deleted —
-- it is marked superseded (restorable for 30 days), then pruned by the cron.
create or replace function activate_sync(p_sync_id bigint) returns void
language plpgsql as $$
begin
  update inventory_syncs set status = 'superseded', superseded_at = now()
   where status = 'active';
  update inventory_syncs set status = 'active', activated_at = now()
   where id = p_sync_id and status = 'pending';
  if not found then
    raise exception 'sync_not_pending';
  end if;
end;
$$;

-- Mirror image of activate_sync: bring a superseded generation back.
-- Only works while its books are still around (not pruned). The generation
-- it displaces becomes superseded-and-restorable itself, so a restore can
-- be undone the same way. Any failure rolls the whole swap back.
create or replace function restore_sync(p_sync_id bigint) returns void
language plpgsql as $$
begin
  update inventory_syncs set status = 'superseded', superseded_at = now()
   where status = 'active' and id <> p_sync_id;
  update inventory_syncs set status = 'active', activated_at = now(),
         superseded_at = null
   where id = p_sync_id
     and status = 'superseded'
     and pruned_at is null
     and exists (select 1 from books b where b.sync_id = p_sync_id);
  if not found then
    raise exception 'sync_not_restorable';
  end if;
end;
$$;

-- Delete the books of generations superseded more than p_days days ago and
-- stamp their sync rows pruned. Returns how many generations were pruned.
create or replace function prune_superseded_syncs(p_days int) returns integer
language plpgsql as $$
declare
  v_ids bigint[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from inventory_syncs
   where status = 'superseded'
     and pruned_at is null
     and superseded_at is not null
     and superseded_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 0));
  if array_length(v_ids, 1) is null then
    return 0;
  end if;
  delete from books where sync_id = any (v_ids);
  update inventory_syncs set pruned_at = now() where id = any (v_ids);
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- Compare a staged (pending) generation against the live one, by dedupe_key.
-- manual_titles lists (up to 20 of) the titles that were added by hand since
-- the last import and are absent from the new file — the ones a replace
-- would silently drop. Rows with unknown age (pre-0021) never count as
-- manual, so the warning can only under-report for old generations.
create or replace function diff_pending_sync(p_sync_id bigint)
returns table (
  added integer,
  removed integer,
  unchanged integer,
  manual_missing integer,
  manual_titles text[]
)
language sql stable as $$
  with active as (
    select id, activated_at from inventory_syncs where status = 'active' limit 1
  ),
  new_keys as (
    select dedupe_key from books where sync_id = p_sync_id
  ),
  live as (
    select b.dedupe_key, b.title,
           (b.created_at is not null
            and a.activated_at is not null
            and b.created_at > a.activated_at) as manual
      from books b
      join active a on b.sync_id = a.id
  ),
  missing_manual as (
    select l.title
      from live l
     where l.manual
       and not exists (select 1 from new_keys n where n.dedupe_key = l.dedupe_key)
     order by l.title
  )
  select
    (select count(*)::int from new_keys n
      where not exists (select 1 from live l where l.dedupe_key = n.dedupe_key)),
    (select count(*)::int from live l
      where not exists (select 1 from new_keys n where n.dedupe_key = l.dedupe_key)),
    (select count(*)::int from live l
      where exists (select 1 from new_keys n where n.dedupe_key = l.dedupe_key)),
    (select count(*)::int from missing_manual),
    (select coalesce(array_agg(t.title), '{}'::text[])
       from (select title from missing_manual limit 20) t);
$$;

grant execute on function activate_sync(bigint) to service_role;
grant execute on function restore_sync(bigint) to service_role;
grant execute on function prune_superseded_syncs(int) to service_role;
grant execute on function diff_pending_sync(bigint) to service_role;
