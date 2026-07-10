import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { audienceForHost, type HostAudience } from "@/lib/hosts";
import { db, dbConfigured } from "@/lib/db";
import type { AdminIdentity } from "@/lib/guards";

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
  const { data, error } = await db()
    .from("admins")
    .select("id, username, email, name, session_v, notify_requests, disabled_at")
    .eq("id", session.sub)
    .maybeSingle();
  if (error || !data || data.disabled_at || data.session_v !== session.v) return null;
  const { disabled_at: _drop, ...identity } = data;
  return identity as AdminIdentity;
}

/** Which site (by Host header) the current request is on. */
export async function currentHostAudience(): Promise<HostAudience> {
  const h = await headers();
  return audienceForHost(h.get("host")) ?? "staff";
}
