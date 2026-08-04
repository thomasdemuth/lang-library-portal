import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  buildAuthorizeUrl,
  googleConfigured,
  pkceChallenge,
  randomToken,
  signState,
} from "@/lib/google-oauth";
import { safeNextPath } from "@/lib/safe-next";
import { withBase } from "@/lib/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begin "Sign in with Google": mint state/nonce/PKCE, stash them in a signed
 * short-lived cookie, and redirect the browser to Google's consent screen.
 * A plain top-level navigation — no client JS, so the CSP is untouched.
 */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    // new URL(absolutePath, base) replaces the whole path, so basePath has
    // to be re-applied by hand — Next only prefixes Link/router targets.
    return NextResponse.redirect(new URL(withBase("/?error=google_unconfigured"), req.url));
  }

  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const codeChallenge = await pkceChallenge(verifier);
  // Only same-site paths survive as the post-login destination.
  const next = safeNextPath(req.nextUrl.searchParams.get("next"), "");

  const res = NextResponse.redirect(buildAuthorizeUrl({ state, nonce, codeChallenge }));
  res.cookies.set(GOOGLE_STATE_COOKIE, await signState({ state, verifier, nonce, next: next || null }), {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level return navigation from Google
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
