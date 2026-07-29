/**
 * Unified-host routing (library.thelangschool.org): one subdomain serves the
 * sign-in page at "/", the student portal at /student/<id>, the staff portal
 * at /staff/<id>, and management at /admin. These helpers are pure — the
 * middleware (edge) and the gate API both lean on them, and they carry no
 * imports so they stay edge-safe and unit-testable.
 *
 * The <id> is a stable slug of the email local part ("kid.tester@…" →
 * "kid-tester"). It is display/routing sugar only: access control is always
 * the session cookie, never the URL — middleware verifies the id matches the
 * signed-in user and bounces mismatches to their own portal home.
 */

export type SessionLike = { aud: "student" | "staff" | "admin" | "guest"; email: string };

/** Guests have no account: they live only on Find a Book + the Library Map. */
export const GUEST_HOME = "/search";

/** "Kid.Tester@students.thelangschool.org" → "kid-tester" (stable, human-readable). */
export function portalIdForEmail(email: string): string {
  const local = email.toLowerCase().split("@")[0] ?? "";
  const slug = local.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "me";
}

/**
 * The signed-in user's canonical home path — where "/" and sign-in land them.
 *
 * Management accounts go to /admin, not to the staff portal: management is
 * the surface they signed in for, and on phones it's the one with the app
 * shell (tab bar, app bar, launch screen). Their staff-portal pages are still
 * theirs at /staff/<id> — see staffHomeFor.
 */
export function homePathFor(session: SessionLike): string {
  if (session.aud === "admin") return "/admin";
  if (session.aud === "guest") return GUEST_HOME;
  return portalHomeFor(session);
}

/** The portal-tree home for a session, ignoring the management surface. */
export function portalHomeFor(session: SessionLike): string {
  const id = portalIdForEmail(session.email);
  return session.aud === "student" ? `/student/${id}` : `/staff/${id}`;
}

export type PortalPath = { tree: "student" | "staff"; id: string; rest: string };

/**
 * Parse a public portal path: /student/<id>[/rest] or /staff/<id>[/rest].
 * Returns null for anything else (including bare /student and /students/…).
 */
export function splitPortalPath(pathname: string): PortalPath | null {
  const m = pathname.match(/^\/(student|staff)\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  return { tree: m[1] as "student" | "staff", id: m[2], rest: m[3] ?? "" };
}

/** Which internal tree a session's bare paths (/games, /search…) belong to. */
export function treeFor(session: SessionLike): "student" | "staff" {
  // Guests render inside the student tree (their pages live there).
  return session.aud === "student" || session.aud === "guest" ? "student" : "staff";
}
