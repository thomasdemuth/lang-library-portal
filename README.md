# Lang Library Portal

The Lang School library's web interface: a **student site**, a **staff site**, and a
**management dashboard**, in one Next.js app.

| Audience | Gets in with | Can do |
|---|---|---|
| Students | `@students.thelangschool.org` email (student site) | Library map, feedback |
| Teachers | `@thelangschool.org` email (staff site) | Everything students can + book requests (their own) |
| Management | username + password (staff site → `/admin`) | Everything: requests queue, inventory, map editor, feedback triage, site usage, sign maker, admin invites |

The two sites live on **separate hostnames** (env-driven), sessions are host-only signed
cookies, and the admin area doesn't exist on the student host.

## Ops runbook (for the library team)

- **Sync the catalog from Libib** — Libib → Export CSV → Management → *Inventory* → drop the
  file → **Import & replace**. The old inventory stays live until the new one finishes, then
  they swap atomically. Do this with your weekly re-shelving.
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
- **Feedback** — Management → *Feedback*: mark read / archive.
- **Site usage** — Management → *Site Usage*: daily views by site, unique visitors, top pages.
- **Print signs** — Management → *Sign Maker* (the full sign generator, admin-only).
- **Change your password** — Management → *My Account* (signs out your other sessions).

## Development

```bash
npm install
npm run dev        # http://staff.localhost:4173 and http://student.localhost:4173
npm test           # matcher/normalizer unit tests
npm run seed       # seed admins from scripts/seed.local.json (gitignored)
```

`.env.example` documents every variable. `*.localhost` hostnames resolve without /etc/hosts.

## Deployment (Vercel + Supabase free tiers)

1. **Supabase**: create a project → SQL Editor → run `supabase/migrations/0001_init.sql`.
   After switching the app to the `sb_secret_…` key, also run `0002_lockdown.sql`
   (defense-in-depth RLS; the service key bypasses it).
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
  it's still a double-clickable standalone file.
