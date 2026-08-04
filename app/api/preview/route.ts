import { NextRequest, NextResponse } from "next/server";
import { withBase } from "@/lib/base";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/session";
import {
  PREVIEW_COOKIE,
  previewCookieOptions,
  previewEnabled,
  previewKeyMatches,
  signPreviewToken,
  verifyPreviewToken,
} from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reviewer preview gate API (staging ONLY — every handler 404s first thing
 * when the staging-only PREVIEW_KEY env var is unset, so in production this
 * route does not exist in behavior).
 *
 *   POST {key}            — the /preview key form. Timing-safe check, then
 *                           set the 30-day `lang_preview` reviewer cookie.
 *   GET ?key=…            — one-tap invite link; same as POST.
 *   GET ?role=student|staff|admin
 *                         — requires a valid reviewer cookie; mints that
 *                           role's SYNTHETIC session and redirects to "/",
 *                           where the middleware lands each role on its home
 *                           (student → /student/preview-student, staff →
 *                           /staff/preview-teacher, admin → /admin).
 *
 * The synthetic identities never touch real accounts: the admin one carries
 * preview:true, which lib/guards.ts honors only while PREVIEW_KEY is set.
 */
const PREVIEW_SESSIONS: Record<string, Session> = {
  student: { aud: "student", email: "preview-student@students.thelangschool.org", name: "Preview Student" },
  staff: { aud: "staff", email: "preview-teacher@thelangschool.org", name: "Preview Teacher" },
  admin: {
    aud: "admin",
    email: "preview-admin@thelangschool.org",
    sub: "preview", // never a real admins.id — the guard bypass ignores it
    name: "Preview Admin",
    v: 0,
    preview: true,
  },
};

function redirectTo(req: NextRequest, path: string): NextResponse {
  // 303: always re-request the target with GET (we redirect out of a POST).
  return NextResponse.redirect(new URL(withBase(path), req.url), 303);
}

/** Key attempt (form POST or ?key= link) → reviewer cookie or back to the form. */
async function grantReviewer(req: NextRequest, key: string): Promise<NextResponse> {
  if (!previewKeyMatches(key)) return redirectTo(req, "/preview?error=badkey");
  const res = redirectTo(req, "/preview");
  res.cookies.set(PREVIEW_COOKIE, await signPreviewToken(), previewCookieOptions());
  return res;
}

export async function GET(req: NextRequest) {
  if (!previewEnabled()) return new NextResponse("Not Found", { status: 404 });

  const params = req.nextUrl.searchParams;
  const key = params.get("key");
  if (key !== null) return grantReviewer(req, key);

  const role = params.get("role") ?? "";
  const session = PREVIEW_SESSIONS[role];
  if (!session) return redirectTo(req, "/preview");

  // The switcher needs the reviewer cookie — the key alone was spent on it.
  const authorized = await verifyPreviewToken(req.cookies.get(PREVIEW_COOKIE)?.value);
  if (!authorized) return redirectTo(req, "/preview");

  const token = await signSession(session);
  const res = redirectTo(req, "/");
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(session.aud));
  return res;
}

export async function POST(req: NextRequest) {
  if (!previewEnabled()) return new NextResponse("Not Found", { status: 404 });

  const form = await req.formData().catch(() => null);
  const key = form?.get("key");
  return grantReviewer(req, typeof key === "string" ? key : "");
}
