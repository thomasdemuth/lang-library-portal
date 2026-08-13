# Lang Library Portal

The Lang School library's web interface: a **student site**, a **staff site**, and a
**management dashboard**, in one Next.js app.

| Audience | Gets in with | Can do |
|---|---|---|
| Students | `@students.thelangschool.org` email (student site) | Find-a-book search, library map, a personal reading log, favorites, custom collections, friends, feedback |
| Teachers | `@thelangschool.org` email (staff site) | Book requests (their own), library map, feedback |
| Management | username + password (staff site → `/admin`) | Requests queue, inventory, map editor, feedback triage, user insights, site usage, sign maker, admin invites |

The two sites live on **separate hostnames** (env-driven), sessions are host-only signed
cookies, and the admin area doesn't exist on the student host. Management access is
role-based (Chief Admin vs granular per-power Admin); a few actions — the Libib CSV import
and publishing app updates — are restricted to the developer account.

## Ops runbook (for the library team)

- **Sync the catalog from Libib** *(developer account only)* — Libib → Export CSV →
  Management → *Inventory* → gear menu → drop the file → **Import & replace**. The old
  inventory stays live until the new one finishes, then they swap atomically. Everyone else
  sees the catalog and can search/scan it, but not re-import it.
- **Scan book barcodes** — Management → *Inventory* → **Scan barcodes** (best on a phone).
  Point the camera at the ISBN barcode: the book comes up instantly with cover, copies, and
  tag. From there: set the category tag, add or remove a copy, or add a book the library
  doesn't own yet (details filled in by ISBN lookup). **Bulk tag** mode tags every scanned
  book with the chosen category — ideal for working down a whole shelf. Adds/removes last
  until the next Libib import (Libib stays the source of truth), so mirror them in Libib;
  **tags are keyed by ISBN and survive every import**.
- **Category tags** — each book can carry one of the map's color categories (Fiction,
  Non-Fiction, Comics, Young Reader, Drama, Other). Set them from a scan or from catalog
  search results; they show as colored pills on desktop and mobile.
- **Put it on your phone** — open the staff site in Safari → Share → **Add to Home Screen**.
  It opens full-screen like an app with the library icon; the scanner is one tap away.
- **Book requests** — new requests email every Chief Admin and show whether the library
  has enough copies. Set the status on *Book Requests* (New → In progress / Ordered / Ready /
  Declined). Marking **Ready** or **Declined** emails the requesting teacher (with your note,
  if you left one). Anything still **New** after 72 hours triggers one reminder email.
- **Weekly summary** — every Friday morning, Chief Admins (and anyone who opts in) get an
  email digest: the week's requests, feedback, inventory imports, map changes, and traffic.
- **Email preferences** — Management → *My Account* → Email notifications: mute new-request
  alerts (chiefs) or toggle the weekly summary (everyone).
- **Edit the map** — Management → *Map Editor*. **Build** mode: drag to draw a shelf.
  **Edit** mode: drag to move, corner square to resize, click for the properties panel
  (label, category color, letter range, public details, internal notes). **Save map** when done.
  Internal notes are never sent to students or teachers.
- **Invite an admin** — Management → *Admins & Invites* → **Create invite link** → send the
  link privately. It works once and expires in 7 days. Disable an admin there too (kills
  their sessions immediately).
- **Add a title by hand** — Management → *Inventory* → **+** (next to the gear): title,
  author, ISBNs, copies, tag. Dedupe adds copies to an existing entry. Like scans, manual
  edits last until the next Libib import.
- **Customize the dashboard** — the management home is a snap-to-grid widget board: drag to
  reorder, drag a corner to resize, and widgets that are big enough show a live peek of their
  page (recent requests, a usage sparkline, an inventory search box…). Per device.
- **User insights** — Management → *User Insights*: every student and teacher account with
  their activity, reading, requests, and admin-only notes; grant a student stars from here.
- **Feedback** — Management → *Feedback*: mark read / archive, and filter by
  **Website** or **Library**. Most entries are now a star rating plus a few tapped
  chips rather than prose; the line at the top averages the stars for each. Rows
  marked *anonymous* came from a QR poster and have no email to reply to.
- **The banner across the top** — Management → *Site Tools*. The strip above the top bar
  on every student and teacher page (never in Management). Write the message, the link
  words, and where the link goes; choose who sees it (everyone / students / teachers), a
  color and an icon, and how long an **×** hides it for. New banners start switched off so
  you can get the wording right before anyone sees it. Changes reach the whole site within
  a minute.
  - **One shows at a time.** Give a banner a start date and it takes over by itself when
    that time comes — no need to switch the old one off first. The list says which one is
    live, which is *Scheduled*, and which is *Waiting* (on, but another banner is winning).
  - Rewriting a banner's message or link shows it again to people who had dismissed it;
    switching it off and on, or fixing a date, does not. There's a checkbox to force it.
  - **Signed-out visitors** only reach Find a Book and the Library Map, so a banner
    linking anywhere else needs a second link for them — leave that blank and guests
    simply aren't shown it.
  - The relaunch banner ("We've updated the Lang Library…") is already in the list, live,
    and can be edited or switched off from here.
- **Print feedback QR posters** — Management → *Sign Maker* → **Feedback QR**. Pick a
  spot (the new website, the library as a whole, or any zone from the Map Editor), then
  *Add to sheet* for each and print. Scanning one opens a one-question page: no sign-in,
  no app, a star and a couple of taps. Codes come from the zone names, so a zone renamed
  after printing still collects feedback — it just files it under the library generally
  rather than that zone, so re-print a zone's poster after renaming it.
- **Site usage** — Management → *Site Usage*: daily views by site, unique visitors, top pages.
- **Print signs** — Management → *Sign Maker* (the full sign generator, admin-only):
  section tabs, banners, wayfinding, advisories, the color guide, and feedback QR posters.
- **Change your password** — Management → *My Account* (signs out your other sessions).

## Development

```bash
npm install
npm run dev        # http://staff.localhost:4173 and http://student.localhost:4173
npm test           # unit tests: matcher/normalizer, shelf resolver, id sampler, safe-redirect
npm run seed       # seed admins from scripts/seed.local.json (gitignored)
```

`.env.example` documents every variable. `*.localhost` hostnames resolve without /etc/hosts.

## Deployment (Vercel + Supabase free tiers)

1. **Supabase**: create a project → SQL Editor → run the `supabase/migrations/*.sql` files
   in numeric order (`0001_init.sql` first). After switching the app to the `sb_secret_…`
   key, run `0002_lockdown.sql` (defense-in-depth RLS; the service key bypasses it). Every
   later migration is idempotent and the app degrades gracefully if one hasn't run yet, so
   they can be applied as you roll features out.
2. **Vercel**: import this GitHub repo. Framework: Next.js, no special build settings.
   Set the env vars below for Production. Add a **second domain** to the project (e.g.
   `lang-library-staff.vercel.app`) so student/staff hosts differ; put those two hostnames
   in `STUDENT_HOST` / `STAFF_HOST`.
3. **Cron**: `vercel.json` schedules `/api/cron/daily` at 11:00 UTC (~6am ET). Set
   `CRON_SECRET` in Vercel env — Vercel sends it automatically as the bearer token.
   The cron also keeps the free Supabase project from pausing.
4. **Seed admins**: locally, with production values in `.env.local`, run `npm run seed`.
5. **Email**: sent AS `library@thelangschool.org` through Gmail's own SMTP — no DNS
   needed, free. One-time setup while signed into that mailbox: turn on 2-Step
   Verification, then create an App password at myaccount.google.com/apppasswords and
   put it in `GMAIL_APP_PASSWORD`. Set `EMAIL_OVERRIDE_TO` to reroute all mail to one
   inbox while testing; clear it to go live.
6. Later, swap to real subdomains (see `docs/IT-HANDOFF.md`) by changing the two host
   env vars — no code changes.

### Environment variables

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | 32+ random chars; signs all session cookies |
| `STUDENT_HOST` / `STAFF_HOST` | the two site hostnames (no protocol) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **`sb_secret_…`** key (never the publishable one) |
| `GMAIL_USER` | the library mailbox all mail is sent as |
| `GMAIL_APP_PASSWORD` | Gmail App password for that mailbox (16 chars) |
| `EMAIL_OVERRIDE_TO` | optional: reroute all mail to one inbox (testing) |
| `CRON_SECRET` | bearer token for `/api/cron/daily` |

No `NEXT_PUBLIC_*` vars exist — the browser never talks to Supabase directly.

## Architecture notes

- `middleware.ts` is the outer wall: host→audience routing, auth guards, CSRF origin
  checks, security headers, and zero-latency usage logging (`event.waitUntil`).
- All database access is server-side via the service-role key (PostgREST over HTTP —
  no client bundles, no connection pools).
- `lib/match.ts` is the shared normalizer/matcher (CSV import + request tagging) — the
  most test-covered code; run `npm test` after touching it.
- Inventory is generational: each CSV import is a new `inventory_syncs` row whose books
  replace the old set atomically on commit (`activate_sync`).
- The sign maker is served verbatim from `assets/sign-maker.html` behind admin auth —
  it's still a double-clickable standalone file. The one part that needs the server is
  the feedback QR poster (zone list + code image come from `/api/admin/qr*`); opened off
  disk it falls back to the static category list and draws a placeholder where the code
  would be.
- Feedback QR codes point at `/hi/<code>` — the one page in the app that is open to
  everyone, signed in or not (`app/hi/[code]`). Its codes are derived from the map's
  shelves by `lib/feedback-spots.ts`, never stored, and an unrecognized one resolves to
  the library as a whole instead of 404ing. `lib/feedback.ts` holds the chip wording and
  is imported by both the browser and the API, so a submitted chip is checked against
  what was actually offered.
- The site banner renders on every page of both portals, so `lib/banners-store.ts` keeps
  the rows in a module-level cache with a 60-second TTL rather than querying per render
  (the repo uses no Next caching APIs — everything is `force-dynamic`). Each serverless
  instance caches separately, so an admin edit is live at once on the instance that
  handled the write and within a minute everywhere else. Which banner wins is decided by
  the pure, unit-tested `pickActiveBanner` in `lib/banners.ts`; `components/BannerBody.tsx`
  is rendered both by the live banner and by the editor's preview so the two can't drift.
  If the table is missing the site simply shows no banner rather than erroring.
