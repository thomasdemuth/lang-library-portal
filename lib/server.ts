import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { audienceForHost, type HostAudience } from "@/lib/hosts";
import { db, dbConfigured } from "@/lib/db";
import type { AdminIdentity } from "@/lib/guards";
import { canDo, type PermKey } from "@/lib/permissions";

/** Session of the current server-rendered request (or null). */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Admin identity for server-rendered admin pages, revalidated against the
 * database (must exist, not disabled, session version must match).
 */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const session = await currentSession();
  if (session?.aud !== "admin" || !session.sub || !dbConfigured()) return null;
  const full = "id, username, email, name, session_v, notify_requests, disabled_at, role, permissions";
  let { data, error } = await db().from("admins").select(full).eq("id", session.sub).maybeSingle();
  if (error && /role|permissions|column/i.test(error.message ?? "")) {
    const retry = await db()
      .from("admins")
      .select("id, username, email, name, session_v, notify_requests, disabled_at")
      .eq("id", session.sub)
      .maybeSingle();
    data = retry.data ? { ...retry.data, role: "chief", permissions: {} } : null;
    error = retry.error;
  }
  if (error || !data || data.disabled_at || data.session_v !== session.v) return null;
  const { disabled_at: _drop, ...rest } = data;
  return {
    ...rest,
    role: rest.role === "chief" ? "chief" : "admin",
    permissions: (rest.permissions as Record<string, boolean>) ?? {},
  } as AdminIdentity;
}

/** For admin pages: current admin or redirect to login. */
export async function requireAdminPage(): Promise<AdminIdentity> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For admin pages that need a specific power — redirect to the dashboard if lacking. */
export async function requirePermPage(key: PermKey): Promise<AdminIdentity> {
  const admin = await requireAdminPage();
  if (!canDo(admin, key)) redirect("/admin");
  return admin;
}

/** For Chief-only admin pages. */
export async function requireChiefPage(): Promise<AdminIdentity> {
  const admin = await requireAdminPage();
  if (admin.role !== "chief") redirect("/admin");
  return admin;
}

/** Which site (by Host header) the current request is on. */
export async function currentHostAudience(): Promise<HostAudience> {
  const h = await headers();
  return audienceForHost(h.get("host")) ?? "staff";
}
