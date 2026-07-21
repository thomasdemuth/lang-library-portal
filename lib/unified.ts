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

export type SessionLike = { aud: "student" | "staff" | "admin"; email: string };

/** "Kid.Tester@students.thelangschool.org" → "kid-tester" (stable, human-readable). */
export function portalIdForEmail(email: string): string {
  const local = email.toLowerCase().split("@")[0] ?? "";
  const slug = local.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "me";
}

/** The signed-in user's canonical portal home path. */
export function homePathFor(session: SessionLike): string {
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
  return session.aud === "student" ? "student" : "staff";
}
