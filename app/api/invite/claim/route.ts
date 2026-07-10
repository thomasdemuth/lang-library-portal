import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded } from "@/lib/guards";
import { hashPassword } from "@/lib/passwords";
import { allowHit, clientIp } from "@/lib/ratelimit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const Body = z.object({
  token: z.string().min(20).max(200),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Username: 3–40 letters, numbers, dots, dashes"),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(10, "Password must be at least 10 characters").max(500),
});

export const POST = guarded(async (req: NextRequest) => {
  if (!(await allowHit("invite_claim", `ip:${clientIp(req)}`, 10, 60 * 60))) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { token, username, email, name, password } = parsed.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");
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

  const admin = Array.isArray(data) ? data[0] : data;
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
});
