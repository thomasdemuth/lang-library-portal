# Codebase Audit — 2026-07-19

Scope: every file in `middleware.ts`, `lib/` (30 modules), `app/api/` (62 routes),
`app/` page trees, `components/` (51), `scripts/`, `public/sw.js`, configs, and
`npm audit` against known CVEs. Baseline commit: `9224c9c`.

Overall: the codebase is in good shape — consistent guard/validation patterns
(zod on every mutating body, permission guards on every admin route, migration
fallbacks everywhere), no XSS sinks (one static pre-paint script, no
`innerHTML`), no secrets in the repo, and a sensible security wall in the
middleware. The findings below are ranked by severity.

---

## High

### H1 · PostgREST filter injection in the admin login (security)
`app/api/admin/login/route.ts` builds a filter from raw user input:
```ts
.or(`username.eq.${body.username},email.eq.${body.username}`)
```
`.or()` filter strings have structural syntax (`,` separates conditions, `.`
separates field/operator/value). A crafted "username" like `x,role.eq.chief`
injects extra conditions. Password verification still stands, so this is **not
an auth bypass**, but it allows: (a) forcing multi-row matches → distinguishable
500s that can be used as a slow boolean oracle over admin-table contents, and
(b) reliability faults on login. Every other `.or()`/`.ilike()` in the codebase
feeds sanitized input (normalized `[a-z0-9 ]`, digit-only ISBNs, surname keys) —
this is the one exception.
**Fix:** query `username.eq` and `email.eq` as two exact-match lookups (no
filter-string interpolation).

### H2 · Infinite loop in the discovery-row sampler (availability bug)
`app/api/catalog/row/route.ts`, kind `random`:
```ts
while (ids.size < 60) ids.add(lo.id + Math.floor(Math.random() * (hi.id - lo.id + 1)));
```
When the active generation's id span is smaller than 60 (fresh install, small
test import), the set can never reach 60 → the request spins until the
serverless timeout, on every student-homepage load. Works today only because
the production catalog is large.
**Fix:** cap the sample target at the id span.

### H3 · Dev-dependency CVEs: vitest ≤3.2.5 chain (critical/high)
`npm audit`: **vitest 2.1.9** pulls vite/vite-node/esbuild versions with a
critical (vitest UI arbitrary file read/execute), a high (vite `server.fs.deny`
bypass), and three moderates. All are **dev-server/test-runner only** — none
ship in the production bundle — but the fix is cheap.
**Fix:** upgrade `vitest` to ^4 (tests must still pass) and take the
`@supabase/supabase-js` patch bump (2.110.2 → 2.110.7).

---

## Medium

### M1 · Open redirect via `?next=` (security)
`GateForm.tsx` and `AdminLoginForm.tsx` honor `?next=` with
`next.startsWith("/")` — which admits protocol-relative URLs like
`//evil.example`, so a crafted login link redirects off-site after sign-in.
**Fix:** require `/` followed by a non-`/` (`/^\/(?!\/)/`).

### M2 · Star-award race in "I read this" (bug)
`app/api/play/read/route.ts` awards points read-modify-write with no
concurrency guard; two quick logs can lose one award. The shop's buy path
already uses optimistic locking (`.eq("points", prev)`).
**Fix:** same optimistic-lock retry pattern on the award.

### M4 · Dashboard usage peek issues 14 queries where 1 RPC suffices (perf)
`app/staff/admin/(shell)/page.tsx` `peeks()` fires 14 per-day head-count
queries against `usage_events` on every dashboard load. The `usage_summary`
RPC (already used by the analytics page) returns the same data in one call.
**Fix:** call the RPC and bucket client-side.

### M5 · Next.js ships a vulnerable bundled postcss (dependency, accepted)
`next@15.5.20` vendors postcss < 8.5.10 (moderate: CSS stringify XSS). The
advisory range covers every Next release up to 16.3 canaries; the fix would be
a Next 16 major upgrade. postcss runs at build time on our own CSS only.
**Deliberately not fixed** — documented as accepted risk until the app takes
the Next 16 upgrade on its own schedule.

---

## Low

- **L1 · Cron bearer comparison isn't constant-time** (`req.headers.get("authorization") !== \`Bearer ${secret}\``). Practical exploitability ≈ 0 (long random secret, network jitter), but `timingSafeEqual` is a two-line hardening.
- **L2 · CSRF posture relies on SameSite=lax + Origin-when-present.** A mutating request with no `Origin` header skips the origin check. All modern browsers send `Origin` on cross-site mutations and cookies are `SameSite=lax`, so this is fine in practice; noted as accepted (a `sec-fetch-site` check would break nothing but adds little).
- **L3 · `ScanPanel` `lastSeen` map grows for the session** (one entry per unique barcode). Bounded by real-world scanning; not worth code.
- **L4 · In-JS aggregation patterns** (`countBy`, leaderboard, loved-row, users list) fetch up to 5 000 rows and count client-side because PostgREST can't group. Fine at school scale; revisit only if tables grow 10×.
- **L5 · Dead code:** `components/NewBooksShelf.tsx` has zero importers (replaced by `BookRow`). The `compact` prop of `AddToCollection` is unused since the home-shelf button was removed.
- **L6 · README is stale:** the audience table predates the student platform (no Find-a-Book, reading game, avatars, favorites/collections/friends), and Libib import is now developer-only.
- **L7 · No linter/formatter is configured** (`eslint-disable` comments exist but no eslint dependency or config — they're inert except under `next build`'s bundled rules). Per instructions, nothing to run; noted.
- **L8 · Loose types:** `SearchResult.books: unknown[]` in `lib/catalog.ts`; a couple of `as unknown as` casts in `InventoryPanel`/`users` route where PostgREST fallback typing fights generics.
- **L9 · `lib/updates.ts`** `{ title: title, … }` non-shorthand; minor style inconsistencies.
- **L10 · Weekly-digest guard key is confusingly built** — `nyDate.slice(0, 8) + "wk" + isoWeek(nyDate)` mixes a calendar `YYYY-MM-` prefix with an ISO week number. I checked every Friday across a year boundary: no two ever collide within the 6-day rate-limit window, so it is **not** a bug — the digest fires correctly. Reads as if it could break, though; keying by ISO year+week would be clearer. Polish only.

## Deliberate behaviors — flagged, not changed

- **Passwordless email gates** (student & staff sites) with 180-day host-only
  cookies, and the staff→student gate handoff that auto-submits the email: by
  design for a school; the admin surface is the password boundary.
- **`/api/gate` has no rate limit** (the `gate` kind exists in `lib/ratelimit`
  docs but is unused). Sessions are free to mint for allowed domains anyway;
  limiting would add friction without a threat model.
- **Daily read cap uses a rolling 24 h window**, not "since midnight" — kids
  see "log the next one tomorrow," which is approximately true; changing it
  would alter game behavior.
- **Undo/redo history is in-memory only** (lost on reload) — deliberate: undo
  against stale server state is worse than no undo.
- **Staff browsing the student site can appear in student features** (reading
  log, leaderboard) — User Insights already filters them out of the student
  list; the leaderboard shows them if they log books. Accepted quirk.
- **`email dev-log`** prints full message bodies to the console — only when
  SMTP creds are absent (dev mode).

---

## Fix plan (phases 2–5)

| Phase | Items |
|---|---|
| Bugs | H2, M2, M3 |
| Performance | M4 |
| Security | H1, M1, L1, H3 (dep upgrades) |
| Polish | L5 (delete dead code), L6 (README), L9, unused prop, regression tests for H2/M2/M3/H1/M1 |
