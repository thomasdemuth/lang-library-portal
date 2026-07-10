-- Defense in depth: the app only ever uses the service-role key (which
-- bypasses RLS), so enabling RLS with NO policies makes the publishable/anon
-- keys completely useless against these tables even if one ever leaks.
--
-- IMPORTANT: swap SUPABASE_SERVICE_ROLE_KEY to the real secret key
-- (sb_secret_…) BEFORE running this, or the app loses database access.

alter table admins            enable row level security;
alter table invite_tokens     enable row level security;
alter table rate_limit_hits   enable row level security;
alter table inventory_syncs   enable row level security;
alter table books             enable row level security;
alter table book_requests     enable row level security;
alter table shelves           enable row level security;
alter table map_settings      enable row level security;
alter table feedback          enable row level security;
alter table usage_events      enable row level security;
