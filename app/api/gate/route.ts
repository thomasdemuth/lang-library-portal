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
import { classifyEmail } from "@/lib/gate";
import { homePathFor } from "@/lib/unified";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/session";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

function withSession(token: string, aud: Session["aud"], body: Record<string, unknown>): NextResponse {
  const res = NextResponse.json({ ok: true, ...body });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(aud));
  return res;
}

/**
 * Dev/fallback email login (unified host). Production forces "Sign in with
 * Google" (see the lockout in POST); this path stays alive only for local
 * testing without Google credentials. It issues a portal session by domain —
 * management still lives on the separate /admin/login page, never here.
 */
async function unifiedGate(email: string) {
  const c = classifyEmail(email);
  if (c.kind === "reject") return NextResponse.json({ error: c.message }, { status: 403 });
  const session: Session = { aud: c.aud, email: c.email };
  const token = await signSession(session);
  return withSession(token, c.aud, { redirect: homePathFor(session) });
}

export async function POST(req: NextRequest) {
  // Production: the passwordless email form is disabled — students and staff
  // sign in with Google, admins on /admin/login. ALLOW_EMAIL_LOGIN=1 is a
  // dev/break-glass escape hatch only.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMAIL_LOGIN !== "1") {
    return NextResponse.json({ error: "Please sign in with Google." }, { status: 403 });
  }

  let email: string;
  try {
    ({ email } = Body.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (isUnifiedHost(req.headers.get("host"))) {
    return unifiedGate(email);
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
