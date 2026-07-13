-- Distinct from disabled_at (which a Chief can toggle back): deleted_at marks
-- a self-service account deletion that couldn't hard-delete the row because
-- other tables reference it. Hides the account from the Admins & Invites
-- roster for good, without losing the history those references point to.
alter table admins add column if not exists deleted_at timestamptz;
