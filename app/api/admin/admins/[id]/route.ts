import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const Body = z.object({ disabled: z.boolean() });

/** Enable/disable another admin. You cannot disable yourself. */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    if (id === admin.id) {
      return NextResponse.json({ error: "You can't disable your own account." }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Bump session_v so a disabled admin's existing sessions die immediately
    const { data: row, error: readErr } = await db()
      .from("admins")
      .select("session_v")
      .eq("id", id)
      .maybeSingle();
    if (readErr || !row) return NextResponse.json({ error: "No such admin" }, { status: 404 });

    const { error } = await db()
      .from("admins")
      .update({
        disabled_at: parsed.data.disabled ? new Date().toISOString() : null,
        session_v: row.session_v + 1,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);
