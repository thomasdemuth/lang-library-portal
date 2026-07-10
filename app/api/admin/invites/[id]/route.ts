import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    const { error } = await db()
      .from("invite_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("used_at", null);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);
