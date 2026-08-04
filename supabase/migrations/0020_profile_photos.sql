-- Google profile photos: the OAuth callback stores the id_token's `picture`
-- URL (validated https://*.googleusercontent.com) on the student's profile
-- row at sign-in, refreshing it only when it changes. Staff have no profile
-- row — their photo travels in the session cookie instead.
-- Additive + idempotent, safe to run standalone.
alter table student_profiles add column if not exists photo_url text;
