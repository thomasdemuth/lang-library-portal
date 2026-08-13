-- 0025_banners.sql — the announcement strip across the top of both sites,
-- moved out of the code and into the library team's hands.
-- Run once in the Supabase SQL editor. Non-destructive & idempotent.
--
-- The relaunch banner shipped hardcoded in components/UpdateBanner.tsx: the
-- sentence, the link, and the dismissal window were constants, so retiring it
-- or writing the next one meant a code change and a deploy. That is a
-- communications task wearing a developer's clothes. This table plus
-- Management → Banners lets the team switch it off, edit it, schedule the next
-- one, and keep the old ones around.
--
-- One banner shows at a time. Several rows may be enabled at once — the app
-- picks the one whose date window is open and has started most recently
-- (lib/banners.ts pickActiveBanner), which is what makes scheduling work: a
-- banner dated next Monday quietly takes over when Monday arrives.
--
-- Three columns need a word of explanation:
--
--   cta_href_guest — guests (no account) are confined by middleware to Find a
--     Book and the Library Map, so a banner linking to /feedback would bounce
--     them somewhere confusing. This is the link they get instead. Left NULL,
--     the banner simply isn't shown to guests, which is the right default for
--     anything account-specific.
--
--   hide_when_answered — stop showing this banner to someone who has already
--     left feedback. True for the relaunch banner (there is no point nagging
--     someone who answered); off by default for everything else, since most
--     announcements have nothing to do with the feedback form.
--
--   legacy_key — a one-release courtesy. Anyone who dismissed the hardcoded
--     banner has `lang_banner_v1_dismissed` sitting in localStorage; the
--     seeded row below carries that key so the app honors that dismissal
--     instead of popping the same banner back up at them. NULL on every
--     banner created from here on, and it can be dropped in a later migration
--     once those keys have aged out.
--
--   content_rev — what a dismissal is keyed to, bumped only when the message,
--     the label, or a link actually changes (or when an admin deliberately
--     asks for it). It exists so that switching a banner off and on again, or
--     correcting an end date, does NOT reappear in front of everyone who
--     already dismissed it — which is what would happen if the key were tied
--     to updated_at. Rewriting the wording, on the other hand, is exactly
--     when it should come back.
--
-- Following the convention of every table added since 0002_lockdown.sql: no
-- RLS statements (the app only ever uses the service-role key, which bypasses
-- it) and no updated_at trigger (the API route stamps it, as it does for
-- games and books).

create table if not exists banners (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 300),
  cta_label text check (cta_label is null or char_length(cta_label) between 1 and 80),
  cta_href text,
  cta_href_guest text,
  audience text not null default 'all'
    check (audience in ('all', 'student', 'staff')),
  tone text not null default 'info'
    check (tone in ('info', 'ok', 'warn', 'alert')),
  icon text not null default 'sparkle',
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  -- 0 = no dismiss button at all (the banner stays until it's switched off).
  dismiss_days integer not null default 30 check (dismiss_days between 0 and 365),
  hide_when_answered boolean not null default false,
  legacy_key text,
  content_rev integer not null default 1 check (content_rev >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

-- A window that ends before it starts can never show anything. Catch it here
-- as well as in the form, so it can't be created by any other route.
alter table banners drop constraint if exists banners_window_check;
alter table banners add constraint banners_window_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- The read that runs on every page load: enabled rows, newest start first.
create index if not exists banners_live on banners (enabled, starts_at desc);

-- Seed the relaunch banner exactly as it currently reads, still live, so
-- nothing changes for visitors when this ships. Guarded so re-running the file
-- never adds a second copy — and so a team that has since deleted it doesn't
-- get it back.
insert into banners (
  message, cta_label, cta_href, cta_href_guest,
  audience, tone, icon, enabled, hide_when_answered, legacy_key
)
select
  'We''ve updated the Lang Library and added new features to improve your experience.',
  -- The → is drawn by the component, so nobody has to type one.
  'Tell us what you think',
  '/feedback?src=banner',   -- ?src=banner is what tags the feedback row
  '/hi/site',               -- guests can't reach /feedback
  'all', 'info', 'sparkle', true, true, 'lang_banner_v1_dismissed'
where not exists (select 1 from banners);
