import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { pkceChallenge, signState, readState, verifyIdToken } from "./google-oauth";

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
const AUD = "test-client.apps.googleusercontent.com";
const NONCE = "nonce-abc";
let priv: KeyPair["privateKey"];
let pub: KeyPair["publicKey"];

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = AUD;
  process.env.AUTH_SECRET = "x".repeat(40); // for signState/readState
  const kp = await generateKeyPair("RS256");
  priv = kp.privateKey;
  pub = kp.publicKey;
});

function idToken(claims: Record<string, unknown>, aud = AUD): Promise<string> {
  return new SignJWT({ nonce: NONCE, email_verified: true, email: "a@b.com", ...claims })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://accounts.google.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(priv);
}

describe("verifyIdToken", () => {
  it("accepts a valid Google ID token and returns the email/name", async () => {
    const t = await idToken({ email: "kid@students.thelangschool.org", name: "Kid Tester" });
    expect(await verifyIdToken(t, NONCE, pub)).toEqual({
      email: "kid@students.thelangschool.org",
      name: "Kid Tester",
    });
  });

  it("lowercases the email", async () => {
    const t = await idToken({ email: "Kid.Tester@Students.TheLangSchool.org" });
    expect((await verifyIdToken(t, NONCE, pub)).email).toBe("kid.tester@students.thelangschool.org");
  });

  it("rejects a wrong audience (token minted for another client)", async () => {
    const t = await idToken({}, "some-other-client");
    await expect(verifyIdToken(t, NONCE, pub)).rejects.toThrow();
  });

  it("rejects an unverified email", async () => {
    const t = await idToken({ email_verified: false });
    await expect(verifyIdToken(t, NONCE, pub)).rejects.toThrow();
  });

  it("rejects a nonce mismatch", async () => {
    const t = await idToken({});
    await expect(verifyIdToken(t, "different-nonce", pub)).rejects.toThrow();
  });
});

describe("pkceChallenge", () => {
  it("is deterministic and URL-safe", async () => {
    const a = await pkceChallenge("verifier-123");
    const b = await pkceChallenge("verifier-123");
    expect(a).toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });
});

describe("state cookie", () => {
  it("round-trips a signed state and rejects tampering", async () => {
    const signed = await signState({ state: "s1", verifier: "v1", nonce: "n1", next: "/staff/x" });
    expect(await readState(signed)).toEqual({ state: "s1", verifier: "v1", nonce: "n1", next: "/staff/x" });
    expect(await readState(signed + "tamper")).toBeNull();
    expect(await readState(undefined)).toBeNull();
  });
});
