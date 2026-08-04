import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/**
 * Staging reviewer preview gate (see app/preview + app/api/preview).
 *
 * Everything here keys off PREVIEW_KEY, a server-only env var that is set
 * ONLY on the staging deployment. When it is unset — production — every
 * function below is a hard "no" before it looks at anything else, so the
 * whole preview surface (page, API, guard bypass) is dead code by behavior.
 *
 * The reviewer cookie is a signed JWT (same jose + AUTH_SECRET pattern as
 * lib/session.ts) with aud "preview". It grants access to the /preview role
 * switcher ONLY — it is never a valid app session (verifySessionToken rejects
 * aud "preview"), and app session cookies are never valid here (their aud is
 * student/staff/admin/guest, rejected by the audience check below).
 */

export const PREVIEW_COOKIE = "lang_preview";

/** 30 days — the reviewer enters the key once. */
export const PREVIEW_MAX_AGE = 30 * 24 * 3600;

const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or too short (need 32+ chars)");
  return encoder.encode(s);
}

/** Whether the staging preview entrance exists at all. */
export function previewEnabled(): boolean {
  return Boolean(process.env.PREVIEW_KEY);
}

/**
 * Timing-safe comparison of a supplied key against PREVIEW_KEY.
 * Always false when PREVIEW_KEY is unset (production).
 */
export function previewKeyMatches(supplied: string): boolean {
  const expected = process.env.PREVIEW_KEY;
  if (!expected) return false; // production: nothing can ever match
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual requires equal length
  return timingSafeEqual(a, b);
}

/** Mint the reviewer cookie's JWT (aud "preview", 30 days). */
export async function signPreviewToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("preview")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PREVIEW_MAX_AGE)
    .sign(secret());
}

/** Verify the reviewer cookie. Always false when PREVIEW_KEY is unset. */
export async function verifyPreviewToken(token: string | undefined): Promise<boolean> {
  if (!process.env.PREVIEW_KEY) return false; // production: no reviewer access, ever
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { audience: "preview" });
    return true;
  } catch {
    return false;
  }
}

export function previewCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_MAX_AGE,
  };
}
