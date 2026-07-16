-- Automated cover/description enrichment queue. The nightly cron works
-- through books missing a description, oldest-attempted first, stamping
-- each as it goes. The partial index keeps that queue query cheap.
alter table books add column if not exists enrich_attempted_at timestamptz;
create index if not exists books_enrich_queue
  on books (sync_id, enrich_attempted_at)
  where description is null;
