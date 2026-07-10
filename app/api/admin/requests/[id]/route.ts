import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const Body = z.object({
  status: z.enum(["new", "in_progress", "ordered", "ready", "declined"]).optional(),
  admin_note: z.string().trim().max(2000).nullable().optional(),
});

export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin(req);
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || (parsed.data.status === undefined && parsed.data.admin_note === undefined)) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note;
    if (parsed.data.status !== undefined) {
      patch.status = parsed.data.status;
      patch.status_updated_at = new Date().toISOString();
      patch.status_updated_by = admin.id;
    }

    const { data, error } = await db()
      .from("book_requests")
      .update(patch)
      .eq("id", requestId)
      .select("id, status, admin_note, status_updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such request" }, { status: 404 });
    return NextResponse.json({ ok: true, request: data });
  }
);
