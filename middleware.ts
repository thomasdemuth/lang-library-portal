import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { audienceForHost, isUnifiedHost, staffHost, studentHost, unifiedHost, type HostAudience } from "@/lib/hosts";
import { homePathFor, portalIdForEmail, splitPortalPath, treeFor } from "@/lib/unified";

/**
 * The outer security wall. Every request passes through here:
 *   1. Host header → routing mode: unified (one subdomain, path-based) or
 *      dual-host (student site vs staff site)
 *   2. CSRF posture: mutating requests must come from our own origin
 *   3. Auth guards per audience (pages redirect, APIs 401)
 *   4. Internal /student and /staff route prefixes are never reachable from outside
 *      (in unified mode the public /student/<id> form maps onto them, with the
 *      id verified against the session — the URL is never the access control)
 *   5. Security headers on every response
 * Handlers re-check permissions on the data they touch; this wall is the first line.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Subpath staging (APP_BASE_PATH=/new2 — see lib/base.ts). The branch is
 * reached through a rewrite on the production domain, so the Host header this
 * deployment sees is its own *.vercel.app URL, never UNIFIED_HOST. Two things
 * follow, and both are inert when APP_BASE_PATH is unset:
 *   - routing is UNIFIED (single host, path + session) regardless of Host, so
 *     student/staff routing behaves exactly as it will in production;
 *   - the production-domain funnel below is off, or it would bounce every
 *     staging request to the bare domain and out of /new2.
 * NOTE: every `pathname` in this file comes from req.nextUrl, which Next
 * strips the basePath from — so all the comparisons below are written in
 * un-prefixed paths and keep matching. Conversely every redirect/rewrite is
 * built from req.nextUrl.clone(), which re-adds the basePath when it is
 * serialized; a `new URL(path, req.url)` would NOT and is not used here.
 */
const SUBPATH_MODE = Boolean(process.env.APP_BASE_PATH);

/**
 * Reviewer preview gate (staging deployments ONLY — see app/preview and
 * lib/preview.ts). PREVIEW_KEY is a server-only env var that production never
 * sets, so there this flag is false and the two preview paths below are as
 * closed as any other unknown route (page redirects to sign-in / rewrites to
 * a 404; API 401s) — and the page + API additionally 404 on their own.
 */
const PREVIEW_ENABLED = Boolean(process.env.PREVIEW_KEY);

// Sign-in entry points reachable while signed out (Google OAuth + guest).
const AUTH_OPEN = ["/api/auth/google/start", "/api/auth/google/callback", "/api/auth/guest"];
// Paths open on both hosts (external form)
const COMMON_OPEN = new Set(["/gate", "/api/gate", "/api/logout", "/api/version", ...AUTH_OPEN]);
// Additional open paths on the staff host
const STAFF_OPEN = new Set(["/admin/login", "/api/admin/login", "/api/invite/claim", "/api/cron/daily"]);
const STAFF_OPEN_PREFIXES = ["/admin/invite/"];
// Open API paths on the unified host
const UNIFIED_OPEN_API = new Set([
  "/api/gate",
  "/api/logout",
  "/api/version",
  "/api/cron/daily",
  "/api/invite/claim",
  "/api/admin/login",
  ...AUTH_OPEN,
]);
// Pages/APIs a guest (no account) may reach: Find a Book + the Library Map.
const GUEST_PAGES = new Set(["/search", "/map"]);
const GUEST_API_PREFIXES = ["/api/catalog", "/api/map"];

function hard404(): NextResponse {
  return applyHeaders(new NextResponse("Not Found", { status: 404 }));
}

function applyHeaders(res: NextResponse, opts?: { frameable?: boolean }): NextResponse {
  const dev = process.env.NODE_ENV !== "production";
  // frameable: same-origin framing only — for the sign maker iframe.
  res.headers.set("X-Frame-Options", opts?.frameable ? "SAMEORIGIN" : "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!dev) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      // App fonts are self-hosted via next/font. Only the sign-maker iframe
      // (assets/sign-maker.html, the sole frameable response) still pulls
      // Montserrat from Google Fonts — keep those hosts for it alone.
      `style-src 'self' 'unsafe-inline'${opts?.frameable ? " https://fonts.googleapis.com" : ""}`,
      `font-src 'self'${opts?.frameable ? " https://fonts.gstatic.com" : ""}`,
      // googleusercontent.com serves the Google-account profile photos.
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      `connect-src 'self'${dev ? " ws:" : ""}`,
      // Blob workers power client-side CSV parsing (PapaParse) off the main
      // thread. Main CSP only — the sign-maker frame needs no workers.
      ...(opts?.frameable ? [] : ["worker-src 'self' blob:"]),
      `frame-ancestors ${opts?.frameable ? "'self'" : "'none'"}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return res;
}

function redirectToLogin(req: NextRequest, loginPath: string): NextResponse {
  const url = req.nextUrl.clone();
  const next = url.pathname + (url.search || "");
  url.pathname = loginPath;
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return applyHeaders(NextResponse.redirect(url));
}

function json401(): NextResponse {
  return applyHeaders(NextResponse.json({ error: "Not signed in" }, { status: 401 }));
}

/** Fire-and-forget page-view insert straight to PostgREST (no SDK in the edge bundle). */
function logUsage(row: {
  audience: string;
  role: string;
  path: string;
  visitor_id: string;
  email: string | null;
}): Promise<unknown> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Promise.resolve();
  const post = (body: Record<string, unknown>) =>
    fetch(`${url}/rest/v1/usage_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
  const { email, ...base } = row;
  if (email === null) return post(base).catch(() => undefined);
  // Pre-migration-0013 the email column doesn't exist — retry without it
  return post(row)
    .then((r) => (r.ok ? r : post(base)))
    .catch(() => undefined);
}

const VID_COOKIE = "lang_vid";

/**
 * Unified host: decide what this request becomes. Pages either redirect
 * (returned directly) or rewrite into the internal /student, /staff, or
 * /signin trees; APIs pass through to their handlers.
 */
function routeUnified(
  req: NextRequest,
  session: Session | null
): { rewrite: string; logAudience: string } | NextResponse {
  const { pathname } = req.nextUrl;

  // APIs: same wall shape as the staff host — /api/admin/* needs an admin
  // session, everything non-open needs some session. Handlers re-check.
  if (pathname.startsWith("/api/")) {
    if (UNIFIED_OPEN_API.has(pathname)) return applyHeaders(NextResponse.next());
    if (session?.aud === "guest") {
      // Guests reach only the read APIs behind Find a Book + the Map.
      const ok = GUEST_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      return ok ? applyHeaders(NextResponse.next()) : json401();
    }
    if (pathname.startsWith("/api/admin/")) {
      if (session?.aud !== "admin") return json401();
    } else if (!session) {
      return json401();
    }
    return applyHeaders(NextResponse.next());
  }

  // Management entry points that must work signed out (invite claims from
  // email links) or signed in — same as the staff host's open set.
  if (pathname === "/admin/login" || STAFF_OPEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { rewrite: `/staff${pathname}`, logAudience: "staff" };
  }

  if (!session) {
    if (pathname === "/") return { rewrite: "/signin", logAudience: "unified" };
    if (pathname === "/gate" || pathname === "/signin") {
      // Sign-out and old gate links land here — canonicalize to "/",
      // keeping ?email/?next handoff params intact.
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return applyHeaders(NextResponse.redirect(url));
    }
    return redirectToLogin(req, "/");
  }

  const home = homePathFor(session);
  const goHome = (): NextResponse => {
    const url = req.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return applyHeaders(NextResponse.redirect(url));
  };

  // Guests (no account) are confined to Find a Book + the Library Map; the
  // "Sign in with Google" upsell links straight to /api/auth/google/start.
  if (session.aud === "guest") {
    if (GUEST_PAGES.has(pathname)) return { rewrite: `/student${pathname}`, logAudience: "guest" };
    return goHome(); // home = /search
  }

  // Signed-in visits to the sign-in page go straight to the portal home.
  if (pathname === "/" || pathname === "/signin" || pathname === "/gate") return goHome();

  // /student/<id>/… and /staff/<id>/… — the canonical portal form. The id is
  // routing sugar: it must match the session (wrong tree or wrong id bounces
  // to your own portal home), then the request maps onto the internal tree.
  const portal = splitPortalPath(pathname);
  if (portal) {
    if (portal.tree !== treeFor(session) || portal.id !== portalIdForEmail(session.email)) {
      return goHome();
    }
    return { rewrite: `/${portal.tree}${portal.rest}`, logAudience: portal.tree };
  }
  if (pathname === "/student" || pathname === "/staff") return goHome();

  // Public student profile pages (linked from leaderboards and User
  // Insights) live in the student tree but are viewable by staff too.
  if (pathname === "/students" || pathname.startsWith("/students/")) {
    return { rewrite: `/student${pathname}`, logAudience: "student" };
  }

  // Management: admin sessions only — students and email-only staff bounce home.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (session.aud !== "admin") return goHome();
    return { rewrite: `/staff${pathname}`, logAudience: "staff" };
  }

  // Everything else (/search, /games, /map, /me, …) belongs to the
  // session's own portal tree.
  const tree = treeFor(session);
  return { rewrite: `/${tree}${pathname}`, logAudience: tree };
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host");
  const { pathname } = req.nextUrl;

  // ── 1. Host header → routing mode ─────────────────────────────────────
  const unified = SUBPATH_MODE || isUnifiedHost(host);

  // In production the app lives ONLY at the unified domain. Every other host
  // — the retired *.vercel.app aliases and per-deployment URLs — permanently
  // funnels there, preserving the path + query so old deep links still land.
  // (Skipped when UNIFIED_HOST isn't configured, so there's never a redirect
  // to nowhere; dev and Vercel previews keep their dual-host behavior.)
  // (Also skipped outright on a subpath staging deployment — see SUBPATH_MODE.)
  const uHost = unifiedHost();
  if (!SUBPATH_MODE && !unified && uHost && process.env.VERCEL_ENV === "production") {
    const target = req.nextUrl.clone();
    target.protocol = "https:";
    target.host = uHost;
    target.port = "";
    return applyHeaders(NextResponse.redirect(target));
  }

  // Dev + Vercel previews fall back to dual-host mode (student/staff by host).
  let audience: HostAudience | null = unified ? null : audienceForHost(host);
  if (!unified && !audience) {
    // Unknown dev/preview host behaves as the staff site (most testable).
    audience = "staff";
  }

  // The web-app manifest and service worker are public everywhere
  // (home-screen install + push notifications)
  if (pathname === "/manifest.webmanifest" || pathname === "/sw.js") {
    return applyHeaders(NextResponse.next());
  }

  // ── 2. Never expose internal route prefixes (dual-host mode) ─────────
  // (exact-segment match: public paths like /students/… must stay reachable)
  if (
    !unified &&
    (pathname === "/student" ||
      pathname.startsWith("/student/") ||
      pathname === "/staff" ||
      pathname.startsWith("/staff/"))
  ) {
    return hard404();
  }
  // The admin surface does not exist on the student host — don't even reveal it
  if (audience === "student" && (pathname.startsWith("/admin") || pathname.startsWith("/api/admin"))) {
    return hard404();
  }

  // ── 3. CSRF posture for mutating requests ─────────────────────────────
  if (MUTATING.has(req.method) && pathname !== "/api/cron/daily") {
    const origin = req.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        /* malformed origin -> reject below */
      }
      const ok =
        originHost === host?.toLowerCase() ||
        originHost === studentHost().toLowerCase() ||
        originHost === staffHost().toLowerCase() ||
        originHost === (unifiedHost() ?? "").toLowerCase();
      if (!ok) return applyHeaders(NextResponse.json({ error: "Bad origin" }, { status: 403 }));
    }
  }

  // Reviewer preview entrance — reachable without a session, in every routing
  // mode, but ONLY when the staging-only PREVIEW_KEY is configured. Placed
  // after the CSRF origin check so the key POST keeps that protection. The
  // page and API also 404 by themselves when PREVIEW_KEY is unset.
  if (PREVIEW_ENABLED && (pathname === "/preview" || pathname === "/api/preview")) {
    // /preview?key=… one-tap link: hand the key to the API route, which
    // validates it, sets the reviewer cookie (server components can't), and
    // returns to /preview. This redirect happens HERE because it must be
    // built from req.nextUrl.clone() — the only construction that serializes
    // the basePath exactly once on a subpath staging deployment.
    if (pathname === "/preview" && req.nextUrl.searchParams.has("key")) {
      const url = req.nextUrl.clone();
      url.pathname = "/api/preview";
      return applyHeaders(NextResponse.redirect(url));
    }
    return applyHeaders(NextResponse.next());
  }

  const session: Session | null = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // ── 4. Auth guards → the internal rewrite target ──────────────────────
  let rewritePath: string;
  let logAudience: string;

  if (unified) {
    const routed = routeUnified(req, session);
    if (routed instanceof NextResponse) return routed;
    ({ rewrite: rewritePath, logAudience } = routed);
  } else {
    const isOpen =
      COMMON_OPEN.has(pathname) ||
      (audience === "staff" &&
        (STAFF_OPEN.has(pathname) || STAFF_OPEN_PREFIXES.some((p) => pathname.startsWith(p))));

    if (!isOpen) {
      const isApi = pathname.startsWith("/api/");

      if (audience === "staff" && (pathname.startsWith("/admin") || pathname.startsWith("/api/admin"))) {
        // Admin-only surface (session_v / disabled checks happen in handlers, which hit the DB anyway)
        if (session?.aud !== "admin") {
          return isApi ? json401() : redirectToLogin(req, "/admin/login");
        }
      } else if (audience === "staff") {
        if (session?.aud !== "staff" && session?.aud !== "admin") {
          return isApi ? json401() : redirectToLogin(req, "/gate");
        }
      } else {
        // Student host: any valid session for this host (host-only cookies keep it student-scoped)
        if (!session) {
          return isApi ? json401() : redirectToLogin(req, "/gate");
        }
      }
    }

    if (pathname.startsWith("/api/")) {
      return applyHeaders(NextResponse.next());
    }
    rewritePath = `/${audience}${pathname === "/" ? "" : pathname}`;
    logAudience = audience as string;
  }

  // ── 5. Rewrite to the internal tree ───────────────────────────────────
  const url = req.nextUrl.clone();
  url.pathname = rewritePath;
  const res = applyHeaders(NextResponse.rewrite(url), {
    frameable: rewritePath === "/staff/admin/sign-maker/frame",
  });

  // ── 6. Usage logging — real page loads only, never blocking ──────────
  const dest = req.headers.get("sec-fetch-dest");
  const isPageLoad =
    dest === "document" ||
    (req.headers.get("rsc") === "1" && !req.headers.get("next-router-prefetch"));
  if (isPageLoad) {
    let vid = req.cookies.get(VID_COOKIE)?.value;
    if (!vid || !/^[0-9a-f][0-9a-f-]{20,50}$/i.test(vid)) {
      vid = crypto.randomUUID();
      res.cookies.set(VID_COOKIE, vid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 400 * 24 * 3600,
        path: "/",
      });
    }
    event.waitUntil(
      logUsage({
        audience: logAudience,
        role: session?.aud ?? "anon",
        path: pathname,
        visitor_id: vid,
        email: session?.email ?? null,
      })
    );
  }
  return res;
}

export const config = {
  matcher: [
    // The site root. Redundant at the domain root (the pattern below already
    // matches "/"), but required under a basePath: Next prefixes each matcher
    // source, and "/new2/((?!…).*)" compiles to a regex whose slash is NOT
    // optional — so bare "/new2" would skip the middleware entirely and 404.
    // "/" prefixes to "/new2", which matches. Matchers are OR-ed, so adding
    // this changes nothing for a root deployment.
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)",
  ],
};
