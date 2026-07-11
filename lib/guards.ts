import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { db } from "@/lib/db";
import { canDo, type AdminRole, type PermKey } from "@/lib/permissions";

export type AdminIdentity = {
  id: string;
  username: string;
  email: string;
  name: string;
  session_v: number;
  notify_requests: boolean;
  role: AdminRole;
  permissions: Record<string, boolean>;
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

  const full = "id, username, email, name, session_v, notify_requests, disabled_at, role, permissions";
  let { data, error } = await db().from("admins").select(full).eq("id", session.sub).maybeSingle();
  // Resilience: before migration 0004, role/permissions don't exist — behave
  // exactly as the app did then (every admin has full access = chief).
  if (error && /role|permissions|column/i.test(error.message ?? "")) {
    const retry = await db()
      .from("admins")
      .select("id, username, email, name, session_v, notify_requests, disabled_at")
      .eq("id", session.sub)
      .maybeSingle();
    data = retry.data ? { ...retry.data, role: "chief", permissions: {} } : null;
    error = retry.error;
  }
  if (error) throw deny(500, "Database error");
  if (!data || data.disabled_at || data.session_v !== session.v) {
    throw deny(401, "Session expired — sign in again");
  }
  const { disabled_at: _drop, ...rest } = data;
  return {
    ...rest,
    role: rest.role === "chief" ? "chief" : "admin",
    permissions: (rest.permissions as Record<string, boolean>) ?? {},
  } as AdminIdentity;
}

/** Chief Admin only. */
export async function requireChief(req: NextRequest): Promise<AdminIdentity> {
  const admin = await requireAdmin(req);
  if (admin.role !== "chief") throw deny(403, "Chief Admins only.");
  return admin;
}

/** An admin holding a specific granted power (or Chief). */
export async function requirePermission(req: NextRequest, key: PermKey): Promise<AdminIdentity> {
  const admin = await requireAdmin(req);
  if (!canDo(admin, key)) throw deny(403, "You don't have permission for that.");
  return admin;
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
