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
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirect back to the sign-in page with a machine-readable error tag. */
function fail(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(`/?error=${error}`, req.url));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
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

  let verified: { email: string; name?: string };
  try {
    const idToken = await exchangeCode(code, saved.verifier);
    verified = await verifyIdToken(idToken, saved.nonce);
  } catch {
    return fail(req, "google");
  }

  const result = classifyEmail(verified.email);
  if (result.kind === "reject") return fail(req, "domain");

  const session: Session = { aud: result.aud, email: result.email };
  const token = await signSession(session);
  const dest = safeNextPath(saved.next, homePathFor(session));

  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(result.aud));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}
