-- 0022_request_flow.sql — make teacher notifications idempotent.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- Book requests can legally revisit an outcome: a declined request may be
-- reopened to `new` and then declined again. Before this, every arrival at
-- ready/declined re-sent the teacher the same email, so a librarian
-- second-guessing a decision spammed them.
--
-- `notified_status` records the last outcome we actually emailed the requester
-- about; the PATCH route only sends when the incoming status differs from it.
-- `notified_at` is when that mail was accepted by the SMTP server — it stays
-- NULL when the send failed, so a failure is visible rather than pretended.
--
-- Both columns are nullable with no default: existing rows read as "never
-- notified". That is deliberately generous — an already-ready request that
-- somehow gets touched again would email once more, which is far better than
-- silently swallowing the one notification a teacher actually needs.

alter table book_requests add column if not exists notified_status text;
alter table book_requests add column if not exists notified_at timestamptz;

do $$
begin
  alter table book_requests
    add constraint book_requests_notified_status_check
    check (notified_status in ('ready', 'declined'));
exception
  when duplicate_object then null;
end
$$;
