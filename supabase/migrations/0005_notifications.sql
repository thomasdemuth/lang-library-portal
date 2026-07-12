-- Weekly digest preference. NULL means "use the role default": Chief Admins
-- receive the Friday summary, regular Admins don't. An explicit true/false
-- set from My Account overrides the default either way.
alter table admins add column if not exists notify_weekly boolean;
