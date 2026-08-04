import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded } from "@/lib/guards";
import { hashPassword } from "@/lib/passwords";
import { allowHit, clientIp } from "@/lib/ratelimit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const Token = z.string().min(20).max(200);

const InviteBody = z.object({
  token: Token,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Username: 3–40 letters, numbers, dots, dashes"),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(10, "Password must be at least 10 characters").max(500),
});

const ResetBody = z.object({
  token: Token,
  password: z.string().min(10, "Password must be at least 10 characters").max(500),
});

type AdminRow = { id: string; username: string; email: string; name: string; session_v: number };

async function sessionResponse(admin: AdminRow): Promise<NextResponse> {
  const jwt = await signSession({
    aud: "admin",
    email: admin.email,
    sub: admin.id,
    name: admin.name,
    v: admin.session_v,
  });
  const res = NextResponse.json({ ok: true, name: admin.name });
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions("admin"));
  return res;
}

/**
 * One endpoint, two token kinds (the kind lives server-side on the row, so
 * the client can't pick):
 *  - invite: consume the token and CREATE a new admin account
 *  - reset:  consume the token and set a new password on the EXISTING admin
 *    (claim_password_reset bumps session_v, revoking all their sessions)
 * Either way the claiming browser leaves signed in.
 */
export const POST = guarded(async (req: NextRequest) => {
  if (!(await allowHit("invite_claim", `ip:${clientIp(req)}`, 10, 60 * 60))) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const tokenParsed = z.object({ token: Token }).safeParse(body);
  if (!tokenParsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const tokenHash = createHash("sha256").update(tokenParsed.data.token).digest("hex");

  // Which kind of link is this? Pre-migration-0023 the kind column doesn't
  // exist — every token is an invite then (resets can't have been minted).
  let kind: "invite" | "reset" = "invite";
  const probe = await db().from("invite_tokens").select("kind").eq("token_hash", tokenHash).maybeSingle();
  if (!probe.error && probe.data?.kind === "reset") kind = "reset";

  if (kind === "reset") {
    const parsed = ResetBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const { data, error } = await db().rpc("claim_password_reset", {
      p_token_hash: tokenHash,
      p_password_hash: passwordHash,
    });
    if (error) {
      if ((error.message ?? "").includes("invalid_invite")) {
        return NextResponse.json(
          { error: "This reset link is invalid, expired, or already used." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return sessionResponse((Array.isArray(data) ? data[0] : data) as AdminRow);
  }

  const parsed = InviteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { username, email, name, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const { data, error } = await db().rpc("claim_invite", {
    p_token_hash: tokenHash,
    p_username: username,
    p_email: email,
    p_name: name,
    p_password_hash: passwordHash,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("invalid_invite")) {
      return NextResponse.json(
        { error: "This invite link is invalid, expired, or already used." },
        { status: 403 }
      );
    }
    if (msg.includes("taken")) {
      return NextResponse.json(
        { error: "That username or email is already an admin." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return sessionResponse((Array.isArray(data) ? data[0] : data) as AdminRow);
});
