import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { audienceForHost, staffHost, studentHost, studentUrl, type HostAudience } from "@/lib/hosts";

/**
 * The outer security wall. Every request passes through here:
 *   1. Host header → audience (student site vs staff site)
 *   2. CSRF posture: mutating requests must come from our own origin
 *   3. Auth guards per audience (pages redirect, APIs 401)
 *   4. Internal /student and /staff route prefixes are never reachable from outside
 *   5. Security headers on every response
 * Handlers re-check permissions on the data they touch; this wall is the first line.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Paths open on both hosts (external form)
const COMMON_OPEN = new Set(["/gate", "/api/gate", "/api/logout"]);
// Additional open paths on the staff host
const STAFF_OPEN = new Set(["/admin/login", "/api/admin/login", "/api/invite/claim", "/api/cron/daily"]);
const STAFF_OPEN_PREFIXES = ["/admin/invite/"];

function hard404(): NextResponse {
  return applyHeaders(new NextResponse("Not Found", { status: 404 }));
}

function applyHeaders(res: NextResponse): NextResponse {
  const dev = process.env.NODE_ENV !== "production";
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!dev) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      `connect-src 'self'${dev ? " ws:" : ""}`,
      "frame-ancestors 'none'",
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
function logUsage(row: { audience: string; role: string; path: string; visitor_id: string }): Promise<unknown> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Promise.resolve();
  return fetch(`${url}/rest/v1/usage_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  }).catch(() => undefined);
}

const VID_COOKIE = "lang_vid";

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host");
  const { pathname } = req.nextUrl;

  // ── 1. Host → audience ────────────────────────────────────────────────
  let audience: HostAudience | null = audienceForHost(host);
  if (!audience) {
    if (process.env.VERCEL_ENV === "production") {
      // Unknown host in production: send to the student site
      return applyHeaders(NextResponse.redirect(studentUrl()));
    }
    // Dev servers and Vercel preview URLs behave as the staff site (most testable)
    audience = "staff";
  }

  // The web-app manifest and service worker are public on both hosts
  // (home-screen install + push notifications)
  if (pathname === "/manifest.webmanifest" || pathname === "/sw.js") {
    return applyHeaders(NextResponse.next());
  }

  // ── 2. Never expose internal route prefixes ───────────────────────────
  if (pathname.startsWith("/student") || pathname.startsWith("/staff")) return hard404();
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
        originHost === staffHost().toLowerCase();
      if (!ok) return applyHeaders(NextResponse.json({ error: "Bad origin" }, { status: 403 }));
    }
  }

  // ── 4. Auth guards ────────────────────────────────────────────────────
  const isOpen =
    COMMON_OPEN.has(pathname) ||
    (audience === "staff" &&
      (STAFF_OPEN.has(pathname) || STAFF_OPEN_PREFIXES.some((p) => pathname.startsWith(p))));

  const session: Session | null = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
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

  // ── 5. Rewrite to the internal audience tree ──────────────────────────
  if (pathname.startsWith("/api/")) {
    return applyHeaders(NextResponse.next());
  }
  const url = req.nextUrl.clone();
  url.pathname = `/${audience}${pathname === "/" ? "" : pathname}`;
  const res = applyHeaders(NextResponse.rewrite(url));

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
      logUsage({ audience, role: session?.aud ?? "anon", path: pathname, visitor_id: vid })
    );
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)"],
};
