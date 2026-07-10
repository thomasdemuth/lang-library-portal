import { SignJWT, jwtVerify } from "jose";

/**
 * One signed httpOnly cookie per host carries the whole session.
 * aud: "student" | "staff" (email-gated visitors) | "admin" (password login).
 * Host-only cookies mean the student and staff subdomains never share sessions.
 */
export const SESSION_COOKIE = "lang_session";

export type Audience = "student" | "staff" | "admin";

export type Session = {
  aud: Audience;
  email: string;
  /** admin id (uuid) — admin sessions only */
  sub?: string;
  /** admin display name — admin sessions only */
  name?: string;
  /** admin session version — must match admins.session_v */
  v?: number;
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
    if (aud !== "student" && aud !== "staff" && aud !== "admin") return null;
    if (typeof payload.email !== "string") return null;
    return {
      aud,
      email: payload.email,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      v: typeof payload.v === "number" ? payload.v : undefined,
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
