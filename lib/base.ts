/**
 * Subpath deployment support.
 *
 * The app normally lives at the root of its domain. To preview a branch at
 * https://library.thelangschool.org/new2/ (a subpath of the SAME production
 * domain) the whole app has to move under a prefix. Two build-time variables
 * turn that on, and NOTHING else in the code changes behaviour:
 *
 *   APP_BASE_PATH=/new2         → next.config.ts `basePath` (server/build)
 *   NEXT_PUBLIC_BASE_PATH=/new2 → the constant below (inlined into the client
 *                                 bundle at build time)
 *
 * With both unset, BASE is "" and every helper here is the identity function,
 * so the built output is behaviourally identical to a root deployment. Set
 * them to the SAME value; they are two variables only because one has to be
 * readable in the browser and one has to be readable by next.config.
 *
 * Next's own `basePath` already prefixes <Link>, router.push, /_next/* chunks,
 * next/font assets, and metadata routes. It does NOT touch raw <a href="/…">,
 * fetch("/api/…"), <img src="/…">, window.location assignments, service-worker
 * registration, or any URL this app composes itself — those go through
 * withBase() below.
 */

/** The path prefix, "" (root) or "/new2" (no trailing slash). Client-safe. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Prefix a root-relative app path with the deployment's base path.
 *
 * Identity when BASE is "" (the default). Idempotent — a path that is already
 * prefixed is returned unchanged, so double-wrapping is harmless. Anything
 * that is not a plain root-relative path (absolute http(s) URLs, "#anchor",
 * "mailto:", protocol-relative "//host/…", relative "foo") passes through
 * untouched.
 */
export function withBase(path: string): string {
  if (!BASE) return path;
  if (!path.startsWith("/")) return path; // absolute URL, #anchor, mailto:, relative
  if (path.startsWith("//")) return path; // protocol-relative — a different origin
  if (path === BASE || path.startsWith(`${BASE}/`)) return path; // already prefixed
  return `${BASE}${path}`;
}

/**
 * The inverse: turn a real browser path back into the app-internal path the
 * code reasons about. Components that compare window.location.pathname against
 * their own link hrefs (SiteHeader, SideNav, MobileTabBar, MobileHeader,
 * Shortcuts, LaunchRedirect) read the location through this so the comparison
 * happens in one coordinate system. Identity when BASE is "".
 */
export function stripBase(path: string): string {
  if (!BASE) return path;
  if (path === BASE) return "/";
  if (path.startsWith(`${BASE}/`)) return path.slice(BASE.length);
  return path;
}

/**
 * Server-side base path — the same value, read from APP_BASE_PATH (what
 * next.config.ts feeds to `basePath`). Used where the server composes an
 * ABSOLUTE URL that leaves the process: OAuth redirect_uri, email deep links,
 * push-notification targets. Never call this from client code; the browser
 * bundle only ever sees NEXT_PUBLIC_BASE_PATH.
 */
export function serverBase(): string {
  return process.env.APP_BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";
}
