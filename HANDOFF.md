# Lang Library — deployment handoff (library.thelangschool.org)

## 1. What this is

Lang Library is the school library's web portal: students browse and search the catalog, earn stars for reading, and build avatars; teachers look up books, request class copies, and browse the games collection; librarians manage inventory, the library map, requests, and analytics. It is a single web app that serves everyone from one subdomain and routes people by role at sign-in.

**Tech stack:** Next.js 15 (App Router, Node 22) · Supabase (hosted Postgres, accessed server-side only) · deployed on Vercel.

**Roles and routes:**

| Role | Who | After sign-in | Access |
|---|---|---|---|
| `student` | `@students.thelangschool.org` emails | `/student/<id>` | Student portal only |
| `staff` | `@thelangschool.org` emails **not** registered as management | `/staff/<id>` | Staff portal (Find a Book, Games, Requests, Map) — no management |
| `admin` | `@thelangschool.org` emails **registered** in the management accounts table (password required) | `/staff/<id>` | Staff portal **plus** the management interface at `/admin` |

`/` is the universal sign-in page (one email field; a password field appears only for registered management accounts). `<id>` is a readable slug derived from the email (`jane.doe@…` → `jane-doe`) — it is cosmetic routing only. **Access control is always the session cookie, verified server-side on every page and API route**; visiting someone else's URL just redirects you to your own portal, and a session without the right role is rejected from staff/management surfaces.

## 2. Prerequisites

- **Node.js 22** and npm (only needed for the one-time admin seeding step and local runs — Vercel builds the app itself).
- A **Supabase project** (free tier is fine). You need its URL and the service-role key (Project Settings → API).
- A **Vercel account** with this Git repository connected.

**Environment variables** (set in Vercel → Project → Settings → Environment Variables; a template lives in `.env.example`, and no real secrets belong in this file or the repo):

| Variable | Required | Description | Example |
|---|---|---|---|
| `AUTH_SECRET` | yes | 32+ random characters; signs every session cookie. Rotating it signs everyone out. | `openssl rand -base64 48` output |
| `UNIFIED_HOST` | yes | The one public hostname, no protocol. Turns on single-domain routing. | `library.thelangschool.org` |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth 2.0 Web client ID — students & teachers sign in with Google. See "Google sign-in setup" below. | `1234-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | yes | Secret for that OAuth client. Server-side only. | `GOCSPX-…` |
| `ALLOW_EMAIL_LOGIN` | no | **Leave unset in production.** Dev/break-glass only — re-enables the old passwordless email login. | `1` (dev only) |
| `STUDENT_HOST` / `STAFF_HOST` | no | Legacy two-hostname mode; still works alongside `UNIFIED_HOST` during a transition. Omit for a fresh deployment. | `student-lang.vercel.app` |
| `SUPABASE_URL` | yes | Supabase project URL. | `https://abcd1234.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service-role key. Server-side only; never exposed to browsers. | `eyJhbGciOi…` |
| `CRON_SECRET` | yes | Random token protecting the daily housekeeping endpoint (`/api/cron/daily`). Vercel Cron sends it automatically once set. | `openssl rand -hex 32` output |
| `GMAIL_USER` | yes* | Gmail mailbox the app sends email as (request notifications, weekly digest). | `library@thelangschool.org` |
| `GMAIL_APP_PASSWORD` | yes* | Gmail **App password** for that mailbox (Google Account → 2-Step Verification → App passwords). | 16-char app password |
| `EMAIL_OVERRIDE_TO` | no | Reroutes ALL outgoing mail to one inbox (dry runs/testing). Leave unset in production. | `it@thelangschool.org` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | no | Web-push keys for update notifications. Generate once: `npx web-push generate-vapid-keys`. | — |
| `GOOGLE_BOOKS_API_KEY` | no | Raises the quota for automatic book-description enrichment. | — |

\* the app runs without email configured; request/digest emails are just skipped.

## 3. DNS

Create one record on `thelangschool.org`:

| Type | Name | Value |
|---|---|---|
| CNAME | `library` | `cname.vercel-dns.com` |

(When you add `library.thelangschool.org` under Vercel → Project → Settings → Domains, Vercel shows this exact target and verifies the record for you. Nothing else — no A record, no wildcard, no nameserver change.)

**If the domain is managed at GoDaddy:**

1. In Vercel first: Project → Settings → **Domains** → add `library.thelangschool.org`. It shows the exact CNAME value it expects — keep the tab open.
2. godaddy.com → sign in → **My Products** / Domain Portfolio → **thelangschool.org** → **DNS** (Manage DNS).
3. **Add New Record**: Type `CNAME` · Name `library` (GoDaddy appends the domain itself) · Value `cname.vercel-dns.com` (or exactly what Vercel showed) · TTL default (1 hour) → **Save**. If a `library` record already exists, edit it — never keep two.
4. Wait for Vercel's domain check to turn **Valid Configuration** (minutes, up to an hour). Vercel then issues the certificate automatically — no TLS setup on GoDaddy.
5. Do **not** change nameservers; this is a single record on the existing zone and doesn't affect mail, `www`, or anything else.

## 4. Hosting & deployment (Vercel)

The repo already carries its production config (`vercel.json` — includes the daily cron job). Steps:

1. Vercel → **Add New Project** → import this Git repository. Framework preset: **Next.js** (defaults are correct: build `next build`, Node 22).
2. Add every environment variable from §2 (Production scope), including `UNIFIED_HOST=library.thelangschool.org`.
3. Deploy. With the Git repo connected this way, every push to `main` deploys automatically. (The project can also be deployed from a checkout with `npx vercel deploy --prod` — it is already linked via `.vercel/project.json` to the existing `lang-library-portal` project, so prefer attaching the domain to that project rather than creating a second one.)
4. Project → Settings → **Domains** → add `library.thelangschool.org`, and create the DNS record from §3 when prompted.
5. Confirm the cron job exists under Project → Settings → **Cron Jobs**: `GET /api/cron/daily`, daily at 11:00 UTC (it sends `CRON_SECRET` as a bearer token automatically).

*Self-hosting instead of Vercel* is possible (`npm ci && npm run build && npm start` behind an HTTPS reverse proxy, plus an external daily scheduler calling `/api/cron/daily` with `Authorization: Bearer <CRON_SECRET>`), but Vercel is the supported, already-configured path.

## 5. HTTPS

Vercel provisions and renews the certificate for `library.thelangschool.org` automatically once the domain verifies — nothing to install. **The app must only ever be served over HTTPS:** session cookies are issued with the `Secure` flag in production, so sign-in simply will not work over plain HTTP. (The app also sends HSTS headers.)

## 6. First-run setup

1. **Database:** in the Supabase dashboard → SQL Editor, run every file in `supabase/migrations/` **in filename order** (`0001_init.sql` → `0017_games.sql`). They are idempotent; re-running is safe.
2. **First management account** (from any machine with this repo, Node 22, and a `.env.local` containing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):
   - copy `scripts/seed.local.example.json` → `scripts/seed.local.json` and fill in username, email (`@thelangschool.org`), display name, and a strong password;
   - run `npm ci && npm run seed`;
   - delete the password from `seed.local.json` afterwards (the file is gitignored). Re-running the seed updates the same account — this is also the password-reset path of last resort.
   Further admins are invited from inside the app (Management → Admins & Invites), so the seed is normally needed once.
3. **Smoke test** at `https://library.thelangschool.org` (needs the Google client configured, §"Google sign-in setup"):
   - [ ] "Sign in with Google" + a `@students.thelangschool.org` account → lands on `/student/<id>`, student portal.
   - [ ] "Sign in with Google" + a `@thelangschool.org` account → lands on `/staff/<id>`, staff portal.
   - [ ] "Continue as a guest" → `/search`; nav shows only Find a Book + Library Map; visiting `/games` or `/me` bounces back to `/search`.
   - [ ] `/admin/login` + the seeded admin username/password → `/admin` (management). Google is **not** involved.
   - [ ] Negative checks: a student visiting `/staff/anything` or `/admin` is bounced to their own portal; a non-school Google account is rejected with a friendly message + guest offer; `POST /api/gate` returns 403 (email login disabled in prod).
   - [ ] Sign out returns to the sign-in page at `/`.

## 7. Maintenance

- **Updates/redeploys:** push to `main` (if the Vercel project is Git-connected) or run `npx vercel deploy --prod` from an up-to-date checkout. Roll back from Vercel → Deployments → "Promote to Production" on any earlier build.
- **Data:** everything lives in the Supabase project (books, games, accounts, requests, map, analytics). Supabase's daily backups cover it (Dashboard → Database → Backups); the uploaded floorplan lives in Supabase Storage. The app servers hold no state.
- **Management accounts:** created/disabled from Management → Admins & Invites; passwords changed under My Account. The seed script (§6.2) is the recovery path if every admin is locked out.

**Known limitations (accepted for now):**

- **Sign-in is Google Workspace SSO** for students and teachers — they authenticate with their school Google account, so identity is proven (no more typing someone else's email). Anyone may also **continue as a guest**: an account-less session limited to Find a Book and the Library Map. **Management** signs in separately at `/admin/login` with a username + password (Google never grants admin). The old passwordless email form is disabled in production (dev-only, behind `ALLOW_EMAIL_LOGIN`). See "Google sign-in setup" below.
- The `/admin/login` page reveals whether a username exists via timing only (it runs a dummy password hash for unknown users), and admin login is rate-limited (10 attempts / 15 min per IP and per account).

## Google sign-in setup (one-time, in Google Cloud Console)

Students and teachers sign in with Google; you need one OAuth client. No Google Workspace-admin rights are required (the app enforces the school domains server-side).

1. **APIs & Services → OAuth consent screen**: User type **External**; app name "Lang Library"; support + developer email = a `@thelangschool.org` address; scopes are the default non-sensitive `openid`, `email`, `profile` (no Google verification review needed). **Publish** the app.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.** Authorized redirect URIs (add both):
   - `https://library.thelangschool.org/api/auth/google/callback` (production)
   - `http://localhost:4173/api/auth/google/callback` (local dev — Google allows `http` for `localhost`)
3. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel (Production) and `.env.local` (dev).

Non-school Google accounts are rejected at the callback with a friendly message and offered the guest option. Because it's an "External" app, anyone can *reach* the Google button, but only `@thelangschool.org` / `@students.thelangschool.org` accounts are let in.
- Related, by design of the inline password prompt: the sign-in page reveals whether a given `@thelangschool.org` email is a registered management account. Password attempts are rate-limited (10 per 15 minutes per address and per IP).
