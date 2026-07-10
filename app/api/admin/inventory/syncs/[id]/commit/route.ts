import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const Body = z.object({
  row_count: z.number().int().min(0).max(1000000).optional(),
  merged_count: z.number().int().min(0).max(1000000).optional(),
});

/** Atomically make this pending generation the live inventory. */
export const POST = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const syncId = Number(id);
    if (!Number.isInteger(syncId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (parsed.success && (parsed.data.row_count != null || parsed.data.merged_count != null)) {
      await db()
        .from("inventory_syncs")
        .update({
          row_count: parsed.data.row_count ?? null,
          merged_count: parsed.data.merged_count ?? null,
        })
        .eq("id", syncId);
    }

    const { error } = await db().rpc("activate_sync", { p_sync_id: syncId });
    if (error) {
      if ((error.message ?? "").includes("sync_not_pending")) {
        return NextResponse.json({ error: "That import is no longer open" }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
);
