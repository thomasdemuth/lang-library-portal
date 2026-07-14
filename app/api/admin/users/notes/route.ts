import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  body: z.string().trim().min(1).max(2000),
});

/** Add an internal note to an account. Notes are admin-eyes-only. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "users");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await db()
    .from("account_notes")
    .insert({
      email: parsed.data.email,
      author: admin.name || admin.username || admin.email,
      body: parsed.data.body,
    })
    .select("id, author, body, created_at")
    .single();
  if (error) {
    if (/account_notes|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "Notes need migration 0013 — run it in the Supabase SQL editor." }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, note: data });
});

/** Remove a note. */
export const DELETE = guarded(async (req: NextRequest) => {
  await requirePermission(req, "users");
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { error } = await db().from("account_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
});
