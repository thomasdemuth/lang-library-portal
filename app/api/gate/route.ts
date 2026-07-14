import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  audienceForHost,
  emailAllowedFor,
  staffUrl,
  studentUrl,
  STAFF_EMAIL_DOMAIN,
  STUDENT_EMAIL_DOMAIN,
} from "@/lib/hosts";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function POST(req: NextRequest) {
  let email: string;
  try {
    email = Body.parse(await req.json()).email;
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Unknown hosts (dev, previews) behave as the staff site, mirroring the middleware.
  const audience = audienceForHost(req.headers.get("host")) ?? "staff";

  if (!emailAllowedFor(audience, email)) {
    if (audience === "student" && emailAllowedFor("staff", email)) {
      return NextResponse.json(
        {
          error: "This is the student site — teachers and staff have their own.",
          hint: { label: "Go to the staff site", url: `${staffUrl()}/gate` },
        },
        { status: 403 }
      );
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
