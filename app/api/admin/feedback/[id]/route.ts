import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const Body = z.object({ status: z.enum(["new", "read", "archived"]) });

export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin(req);
    const { id } = await ctx.params;
    const feedbackId = Number(id);
    if (!Number.isInteger(feedbackId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { data, error } = await db()
      .from("feedback")
      .update({
        status: parsed.data.status,
        handled_by: admin.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", feedbackId)
      .select("id, status")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such feedback" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
);
