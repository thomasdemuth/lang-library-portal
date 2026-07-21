import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  audienceForHost,
  emailAllowedFor,
  isUnifiedHost,
  staffUrl,
  studentUrl,
  STAFF_EMAIL_DOMAIN,
  STUDENT_EMAIL_DOMAIN,
} from "@/lib/hosts";
import { homePathFor } from "@/lib/unified";
import { db, dbConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { allowHit, clientIp } from "@/lib/ratelimit";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/session";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(500).optional(),
});

function withSession(token: string, aud: Session["aud"], body: Record<string, unknown>): NextResponse {
  const res = NextResponse.json({ ok: true, ...body });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(aud));
  return res;
}

/**
 * Unified host (library.thelangschool.org): one sign-in for everyone.
 *   student email                    → student session → /student/<id>
 *   staff email, not registered     → staff session   → /staff/<id>
 *   staff email, registered account → { requiresPassword: true } until the
 *     password arrives; correct password → admin session → /staff/<id>
 * The email is checked against the admins table BEFORE any session is
 * issued, so the form can reveal the password field inline.
 */
async function unifiedGate(email: string, password: string | undefined, req: NextRequest) {
  if (emailAllowedFor("student", email)) {
    const session: Session = { aud: "student", email };
    const token = await signSession(session);
    return withSession(token, "student", { redirect: homePathFor(session) });
  }

  if (!emailAllowedFor("staff", email)) {
    return NextResponse.json(
      {
        error: `Please use your school email (@${STUDENT_EMAIL_DOMAIN} for students, @${STAFF_EMAIL_DOMAIN} for staff).`,
      },
      { status: 403 }
    );
  }

  // Staff domain: is this a registered management account?
  let admin: {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    session_v: number;
    disabled_at: string | null;
  } | null = null;
  if (dbConfigured()) {
    const { data } = await db()
      .from("admins")
      .select("id, email, name, password_hash, session_v, disabled_at")
      .eq("email", email)
      .maybeSingle();
    // On a lookup failure we fall through to a plain staff session: the
    // portal keeps working, and management needs the database anyway.
    admin = data ?? null;
  }

  if (!admin || admin.disabled_at) {
    const session: Session = { aud: "staff", email };
    const token = await signSession(session);
    return withSession(token, "staff", { redirect: homePathFor(session) });
  }

  // Registered account, no password yet → tell the form to ask for one.
  if (!password) {
    return NextResponse.json({ requiresPassword: true });
  }

  const ip = clientIp(req);
  const [ipOk, userOk] = await Promise.all([
    allowHit("admin_login", `ip:${ip}`, 10, 15 * 60),
    allowHit("admin_login", `user:${email}`, 10, 15 * 60),
  ]);
  if (!ipOk || !userOk) {
    return NextResponse.json(
      { error: "Too many attempts — wait 15 minutes and try again.", requiresPassword: true },
      { status: 429 }
    );
  }

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Wrong password — try again.", requiresPassword: true },
      { status: 401 }
    );
  }

  const session: Session = {
    aud: "admin",
    email: admin.email,
    sub: admin.id,
    name: admin.name,
    v: admin.session_v,
  };
  const token = await signSession(session);
  await db().from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
  return withSession(token, "admin", { redirect: homePathFor(session), name: admin.name });
}

export async function POST(req: NextRequest) {
  let email: string;
  let password: string | undefined;
  try {
    ({ email, password } = Body.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (isUnifiedHost(req.headers.get("host"))) {
    return unifiedGate(email, password, req);
  }

  // Unknown hosts (dev, previews) behave as the staff site, mirroring the middleware.
  const audience = audienceForHost(req.headers.get("host")) ?? "staff";

  if (!emailAllowedFor(audience, email)) {
    if (audience === "student" && emailAllowedFor("staff", email)) {
      // Teachers and admins may browse the student site (e.g. to see what
      // students see, or to open a student's profile page from User
      // Insights). The session is host-scoped and grants student powers only.
      const token = await signSession({ aud: "student", email });
      const res = NextResponse.json({
        ok: true,
        note: `Welcome! You're browsing the student site as staff — the staff site is at ${staffUrl()}.`,
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions("student"));
      return res;
    }
    if (audience === "staff" && emailAllowedFor("student", email)) {
      // Students who land on the staff site glide straight through: the
      // student gate auto-submits this email on arrival (neither gate has
      // a password, so the handoff carries nothing sensitive).
      return NextResponse.json({
        ok: true,
        redirect: `${studentUrl()}/gate?email=${encodeURIComponent(email)}&auto=1`,
      });
    }
    const domain = audience === "student" ? STUDENT_EMAIL_DOMAIN : STAFF_EMAIL_DOMAIN;
    return NextResponse.json(
      { error: `Please use your @${domain} school email.` },
      { status: 403 }
    );
  }

  const token = await signSession({ aud: audience, email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(audience));
  return res;
}
