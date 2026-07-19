import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { burnDummyVerify, verifyPassword } from "@/lib/passwords";
import { allowHit, clientIp } from "@/lib/ratelimit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { guarded } from "@/lib/guards";

const Body = z.object({
  username: z.string().trim().toLowerCase().min(1).max(200),
  password: z.string().min(1).max(500),
});

export const POST = guarded(async (req: NextRequest) => {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const ip = clientIp(req);
  const [ipOk, userOk] = await Promise.all([
    allowHit("admin_login", `ip:${ip}`, 10, 15 * 60),
    allowHit("admin_login", `user:${body.username}`, 10, 15 * 60),
  ]);
  if (!ipOk || !userOk) {
    return NextResponse.json(
      { error: "Too many attempts — wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  // Username or email both work. Use two exact-match lookups rather than a
  // PostgREST .or() filter string: the identifier is user-controlled and
  // .or() has structural syntax (',' and '.' are operators), so interpolating
  // it there would let a crafted value inject extra filter conditions.
  const cols = "id, username, email, name, password_hash, session_v, disabled_at";
  const [byUsername, byEmail] = await Promise.all([
    db().from("admins").select(cols).eq("username", body.username).maybeSingle(),
    db().from("admins").select(cols).eq("email", body.username).maybeSingle(),
  ]);
  if (byUsername.error || byEmail.error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const admin = byUsername.data ?? byEmail.data;

  if (!admin || admin.disabled_at) {
    await burnDummyVerify(); // constant-time-ish response for unknown users
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const ok = await verifyPassword(body.password, admin.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const token = await signSession({
    aud: "admin",
    email: admin.email,
    sub: admin.id,
    name: admin.name,
    v: admin.session_v,
  });

  await db().from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);

  const res = NextResponse.json({ ok: true, name: admin.name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions("admin"));
  return res;
});
