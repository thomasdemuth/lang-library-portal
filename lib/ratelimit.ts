import type { NextRequest } from "next/server";
import { db, dbConfigured } from "@/lib/db";

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : null)?.trim() || "unknown";
}

/**
 * Record a hit and report whether the caller is within limits.
 * kind: 'admin_login' | 'invite_claim' | 'gate' | 'feedback'
 * Fails OPEN when the database is unreachable/unconfigured (these endpoints
 * degrade gracefully; login itself still requires the DB to succeed at all).
 */
export async function allowHit(
  kind: string,
  identifier: string,
  max: number,
  windowSecs: number
): Promise<boolean> {
  if (!dbConfigured()) return true;
  try {
    const { data, error } = await db().rpc("hit_rate_limit", {
      p_kind: kind,
      p_identifier: identifier,
      p_max: max,
      p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}
