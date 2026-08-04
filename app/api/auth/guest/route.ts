import { NextRequest, NextResponse } from "next/server";
import { GUEST_HOME } from "@/lib/unified";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { withBase } from "@/lib/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Continue as guest": mint a restricted, account-less session and drop the
 * visitor on Find a Book. Middleware confines guests to Find a Book + the
 * Library Map. Guests carry no email — nothing is keyed to them.
 */
export async function GET(req: NextRequest) {
  const token = await signSession({ aud: "guest", email: "" });
  const res = NextResponse.redirect(new URL(withBase(GUEST_HOME), req.url));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions("guest"));
  return res;
}
