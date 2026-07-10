import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { db } from "@/lib/db";

export type AdminIdentity = {
  id: string;
  username: string;
  email: string;
  name: string;
  session_v: number;
  notify_requests: boolean;
};

export class GuardError extends Error {
  constructor(public response: NextResponse) {
    super("guard");
  }
}

function deny(status: number, error: string): GuardError {
  return new GuardError(NextResponse.json({ error }, { status }));
}

/** Any signed-in session on this host (middleware already enforced audience). */
export async function requireSession(req: NextRequest): Promise<Session> {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw deny(401, "Not signed in");
  return session;
}

/** Staff or admin session (book requests, staff feedback). */
export async function requireStaff(req: NextRequest): Promise<Session> {
  const session = await requireSession(req);
  if (session.aud !== "staff" && session.aud !== "admin") throw deny(403, "Staff only");
  return session;
}

/**
 * Admin session, revalidated against the database: the admin must still
 * exist, not be disabled, and the token's session version must match
 * (password changes bump it, revoking older sessions).
 */
export async function requireAdmin(req: NextRequest): Promise<AdminIdentity> {
  const session = await requireSession(req);
  if (session.aud !== "admin" || !session.sub) throw deny(401, "Admin sign-in required");

  const { data, error } = await db()
    .from("admins")
    .select("id, username, email, name, session_v, notify_requests, disabled_at")
    .eq("id", session.sub)
    .maybeSingle();
  if (error) throw deny(500, "Database error");
  if (!data || data.disabled_at || data.session_v !== session.v) {
    throw deny(401, "Session expired — sign in again");
  }
  const { disabled_at: _drop, ...identity } = data;
  return identity as AdminIdentity;
}

/** Wrap a route handler so GuardError responses are returned, not thrown. */
export function guarded<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof GuardError) return e.response;
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
