import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

/** Abort a pending import (the active inventory is untouched). */
export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const syncId = Number(id);
    if (!Number.isInteger(syncId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { data: sync } = await db()
      .from("inventory_syncs")
      .select("id, status")
      .eq("id", syncId)
      .maybeSingle();
    if (!sync) return NextResponse.json({ error: "No such import" }, { status: 404 });
    if (sync.status !== "pending") {
      return NextResponse.json({ error: "Only pending imports can be aborted" }, { status: 409 });
    }

    await db().from("books").delete().eq("sync_id", syncId);
    await db().from("inventory_syncs").update({ status: "aborted" }).eq("id", syncId);
    return NextResponse.json({ ok: true });
  }
);
