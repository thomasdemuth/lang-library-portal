import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  exchangeCode,
  googleConfigured,
  readState,
  verifyIdToken,
} from "@/lib/google-oauth";
import { classifyEmail } from "@/lib/gate";
import { homePathFor } from "@/lib/unified";
import { safeNextPath } from "@/lib/safe-next";
import { withBase } from "@/lib/base";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/session";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirect back to the sign-in page with a machine-readable error tag. */
function fail(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(withBase(`/?error=${error}`), req.url));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}

/**
 * Remember a student's Google profile photo on their student_profiles row
 * (created here if this is their first sign-in). Writes only when the URL
 * actually changed, so a routine login costs one read, not a write. Strictly
 * best-effort: any error (photo_url column pending 0020, table pending 0011,
 * DB down) is swallowed — a missing photo must never block sign-in.
 */
async function saveStudentPhoto(email: string, picture: string | undefined): Promise<void> {
  if (!picture || !dbConfigured()) return;
  try {
    const { data, error } = await db()
      .from("student_profiles")
      .select("photo_url")
      .eq("email", email)
      .maybeSingle();
    if (error) return; // pre-migration schema — skip quietly
    if (!data) {
      await db().from("student_profiles").insert({ email, photo_url: picture });
    } else if (data.photo_url !== picture) {
      await db().from("student_profiles").update({ photo_url: picture }).eq("email", email);
    }
  } catch {
    /* never let photo capture break login */
  }
}

/**
 * Google returns here with ?code&state. We validate state (CSRF), exchange
 * the code, verify the ID token, classify the verified email into a portal
 * session, and set the normal app session cookie. Management is never granted
 * here — admins use /admin/login.
 */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return fail(req, "google_unconfigured");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail(req, "google_denied");

  const code = params.get("code");
  const state = params.get("state");
  const saved = await readState(req.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  if (!code || !state || !saved || saved.state !== state) {
    return fail(req, "google_state");
  }

  let verified: { email: string; name?: string; picture?: string };
  try {
    const idToken = await exchangeCode(code, saved.verifier);
    verified = await verifyIdToken(idToken, saved.nonce);
  } catch {
    return fail(req, "google");
  }

  const result = classifyEmail(verified.email);
  if (result.kind === "reject") return fail(req, "domain");

  // Profile photo: students get a DB row (student_profiles.photo_url) that
  // every surface — including classmates' views — can read; staff have no
  // profile row, so their photo rides in the session cookie instead.
  const session: Session = { aud: result.aud, email: result.email };
  if (result.aud === "staff" && verified.picture) session.picture = verified.picture;
  if (result.aud === "student") await saveStudentPhoto(result.email, verified.picture);
  const token = await signSession(session);
  const dest = safeNextPath(saved.next, homePathFor(session));

  const res = NextResponse.redirect(new URL(withBase(dest), req.url));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(result.aud));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}
