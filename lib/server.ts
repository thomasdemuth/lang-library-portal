import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";
import { audienceForHost, type HostAudience } from "@/lib/hosts";

/** Session of the current server-rendered request (or null). */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Which site (by Host header) the current request is on. */
export async function currentHostAudience(): Promise<HostAudience> {
  const h = await headers();
  return audienceForHost(h.get("host")) ?? "staff";
}
