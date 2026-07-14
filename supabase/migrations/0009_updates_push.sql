-- App updates (announcements) + web-push plumbing.
-- notify_updates: null = default ON; explicit false = opted out.
alter table admins add column if not exists notify_updates boolean;

create table app_updates (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  created_by uuid references admins(id),
  created_at timestamptz not null default now()
);

-- One row per device that enabled notifications (endpoint is unique per
-- browser+device push registration).
create table push_subscriptions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references admins(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_admin on push_subscriptions (admin_id);
