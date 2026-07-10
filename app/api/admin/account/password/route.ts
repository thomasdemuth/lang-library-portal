import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const Body = z.object({
  current: z.string().min(1).max(500),
  next: z.string().min(10, "New password must be at least 10 characters").max(500),
});

export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { data: row, error } = await db()
    .from("admins")
    .select("password_hash, session_v")
    .eq("id", admin.id)
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  if (!(await verifyPassword(parsed.data.current, row.password_hash))) {
    return NextResponse.json({ error: "Current password is wrong." }, { status: 403 });
  }

  const newHash = await hashPassword(parsed.data.next);
  const newV = row.session_v + 1; // revokes every other session
  const { error: upErr } = await db()
    .from("admins")
    .update({ password_hash: newHash, session_v: newV })
    .eq("id", admin.id);
  if (upErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Re-issue this browser's session at the new version
  const token = await signSession({
    aud: "admin",
    email: admin.email,
    sub: admin.id,
    name: admin.name,
    v: newV,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions("admin"));
  return res;
});
