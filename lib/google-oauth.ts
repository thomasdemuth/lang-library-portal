import { SignJWT, jwtVerify, createRemoteJWKSet, type KeyLike } from "jose";
import { unifiedUrl } from "./hosts";

/**
 * Google Workspace SSO via the server-side OAuth 2.0 authorization-code flow
 * (full-page redirects, no client JS — keeps the strict CSP untouched). This
 * module is Node-side only: it is imported by the /api/auth/google/* route
 * handlers (runtime "nodejs"), never by the edge middleware.
 *
 * The short-lived `g_oauth` cookie carries the CSRF `state`, the PKCE
 * `verifier`, the OIDC `nonce`, and the post-login `next` path across the
 * round-trip to Google. It is signed with AUTH_SECRET so it can't be forged.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const GOOGLE_STATE_COOKIE = "g_oauth";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Callback URL Google returns to — derived from UNIFIED_HOST, never hardcoded. */
export function redirectUri(): string {
  return `${unifiedUrl()}/api/auth/google/callback`;
}

const encoder = new TextEncoder();
function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or too short (need 32+ chars)");
  return encoder.encode(s);
}

const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

/** URL-safe random string (used for state, nonce, and the PKCE verifier). */
export function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return b64url(new Uint8Array(digest));
}

export type OAuthState = { state: string; verifier: string; nonce: string; next: string | null };

export async function signState(s: OAuthState): Promise<string> {
  return new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600) // 10 min
    .sign(secret());
}

export async function readState(token: string | undefined): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.state !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.nonce !== "string"
    ) {
      return null;
    }
    return {
      state: payload.state,
      verifier: payload.verifier,
      nonce: payload.nonce,
      next: typeof payload.next === "string" ? payload.next : null,
    };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(opts: { state: string; nonce: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    // Always show the account chooser (multi-account devices / shared machines).
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/** Exchange the authorization code for tokens (server-to-server, over TLS). */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("No id_token in Google token response");
  return data.id_token;
}

/**
 * The id_token's `picture` claim, but only when it looks like a genuine
 * Google-hosted photo URL (https on *.googleusercontent.com — the host our
 * CSP img-src allows). Anything else is dropped rather than stored.
 */
function safePictureUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return undefined;
    if (u.hostname !== "googleusercontent.com" && !u.hostname.endsWith(".googleusercontent.com")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Verify the ID token's signature (Google JWKS), issuer, audience, that the
 * email is verified, and that the nonce matches the one we sent. Returns the
 * (lowercased) verified email + display name + profile photo (scope includes
 * `profile`, so Google puts a `picture` claim in the id_token when the
 * account has one — absent otherwise, and we tolerate that).
 */
export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
  keys: KeyLike | Uint8Array | ReturnType<typeof createRemoteJWKSet> = JWKS
): Promise<{ email: string; name?: string; picture?: string }> {
  const opts = { issuer: ISSUERS, audience: process.env.GOOGLE_CLIENT_ID };
  // `keys` is either a remote-JWKS getter (function) or a raw key — pick the
  // matching jwtVerify overload so both prod and tests type-check.
  const { payload } =
    typeof keys === "function"
      ? await jwtVerify(idToken, keys, opts)
      : await jwtVerify(idToken, keys, opts);
  if (payload.email_verified !== true) throw new Error("Google email not verified");
  if (payload.nonce !== expectedNonce) throw new Error("OAuth nonce mismatch");
  if (typeof payload.email !== "string") throw new Error("No email in ID token");
  return {
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: safePictureUrl(payload.picture),
  };
}
