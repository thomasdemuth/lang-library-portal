import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { verifyPassword } from "@/lib/passwords";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const Body = z.object({ password: z.string().min(1, "Enter your password to confirm.") });
const NameBody = z.object({ name: z.string().trim().min(1, "Enter a display name.").max(80) });

const PROTECTED_EMAIL = "library@thelangschool.org";

function isForeignKeyViolation(message: string | undefined): boolean {
  return /foreign key|violates.*constraint/i.test(message ?? "");
}

/** Change your own display name (any admin, own row only). */
export const PATCH = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = NameBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const name = parsed.data.name;

  const { error } = await db().from("admins").update({ name }).eq("id", admin.id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Re-issue this browser's session so the token's cached name stays in sync.
  const token = await signSession({ aud: "admin", email: admin.email, sub: admin.id, name, v: admin.session_v });
  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions("admin"));
  return res;
});

/**
 * Self-service account deletion. The shared `library@` mailbox account can't
 * be deleted this way (it's the fallback login every other admin depends on).
 *
 * Tries a real row delete first; if the admin has history elsewhere (handled
 * a request, ran an import, edited the map...) foreign keys block that, so we
 * fall back to the same disable-and-revoke-sessions path Chiefs use — the
 * account can no longer sign in or appear as active, but past records stay intact.
 */
export const DELETE = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (admin.email.toLowerCase() === PROTECTED_EMAIL) {
    return NextResponse.json({ error: "This account can't be deleted." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: row, error: readErr } = await db()
    .from("admins")
    .select("password_hash")
    .eq("id", admin.id)
    .single();
  if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!(await verifyPassword(parsed.data.password, row.password_hash))) {
    return NextResponse.json({ error: "Password is wrong." }, { status: 403 });
  }

  if (admin.role === "chief") {
    const { count } = await db()
      .from("admins")
      .select("id", { count: "exact", head: true })
      .eq("role", "chief")
      .is("disabled_at", null)
      .neq("id", admin.id);
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: "You're the last active Chief Admin — promote someone else first." },
        { status: 400 }
      );
    }
  }

  const { error: delErr } = await db().from("admins").delete().eq("id", admin.id);
  if (delErr && !isForeignKeyViolation(delErr.message)) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (delErr) {
    // History elsewhere references this admin — disable instead of erasing,
    // and mark deleted_at so the Admins & Invites roster hides it for good
    // (unlike a Chief-initiated disable, which stays visible to re-enable).
    const now = new Date().toISOString();
    let disableErr = (await db()
      .from("admins")
      .update({ disabled_at: now, deleted_at: now, session_v: 999999999 })
      .eq("id", admin.id)).error;
    if (disableErr && /deleted_at|column/i.test(disableErr.message ?? "")) {
      disableErr = (await db()
        .from("admins")
        .update({ disabled_at: now, session_v: 999999999 })
        .eq("id", admin.id)).error;
    }
    if (disableErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
});
