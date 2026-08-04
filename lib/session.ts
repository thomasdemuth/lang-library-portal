import { SignJWT, jwtVerify } from "jose";

/**
 * One signed httpOnly cookie per host carries the whole session.
 * aud: "student" | "staff" (Google sign-in) | "admin" (password login) |
 * "guest" (no account — a restricted lookup+map-only visitor).
 * Host-only cookies mean the student and staff subdomains never share sessions.
 */
export const SESSION_COOKIE = "lang_session";

export type Audience = "student" | "staff" | "admin" | "guest";

export type Session = {
  aud: Audience;
  email: string;
  /** admin id (uuid) — admin sessions only */
  sub?: string;
  /** admin display name — admin sessions only */
  name?: string;
  /** admin session version — must match admins.session_v */
  v?: number;
  /**
   * Google profile-photo URL — staff sessions only. Staff have no DB profile
   * row, so the (short, ~100-char) URL rides in the cookie and refreshes on
   * re-login. Students get theirs from student_profiles.photo_url instead,
   * keeping the long-lived student cookie small.
   */
  picture?: string;
  /**
   * Staging reviewer flag — set ONLY by /api/preview (which requires the
   * staging-only PREVIEW_KEY env var) on the synthetic admin session. The
   * claim is inert unless the running server ALSO has PREVIEW_KEY set: every
   * consumer (lib/guards.ts, lib/server.ts) checks that first. In production
   * PREVIEW_KEY is unset, so no such token is ever minted and a forged claim
   * changes nothing.
   */
  preview?: boolean;
};

const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or too short (need 32+ chars)");
  return encoder.encode(s);
}

export const SESSION_MAX_AGE: Record<Audience, number> = {
  student: 180 * 24 * 3600,
  staff: 180 * 24 * 3600,
  admin: 14 * 24 * 3600,
  guest: 12 * 3600, // ephemeral: no account, expires same day
};

export async function signSession(session: Session): Promise<string> {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE[session.aud])
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const aud = payload.aud;
    if (aud !== "student" && aud !== "staff" && aud !== "admin" && aud !== "guest") return null;
    if (typeof payload.email !== "string") return null;
    return {
      aud,
      email: payload.email,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      v: typeof payload.v === "number" ? payload.v : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      preview: payload.preview === true ? true : undefined,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(aud: Audience) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE[aud],
  };
}
