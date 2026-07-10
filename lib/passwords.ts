import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** scrypt parameters: N=2^14, r=8, p=1, 64-byte key (~50ms per hash). */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, KEYLEN, { N, r: R, p: P })) as Buffer;
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split(":");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const key = (await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })) as Buffer;
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Burned when a login hits an unknown username, so response timing doesn't
 * reveal which usernames exist. (Hash of a random string, computed per call.)
 */
export async function burnDummyVerify(): Promise<void> {
  const salt = randomBytes(16);
  await scrypt("dummy-password-timing", salt, KEYLEN, { N, r: R, p: P });
}
