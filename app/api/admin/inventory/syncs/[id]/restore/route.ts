import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { invalidateActiveSync } from "@/lib/active-sync";

/**
 * Bring a superseded catalog generation back live (the mirror image of
 * commit). Only possible while its books are still kept — the daily cron
 * prunes generations 30 days after they were superseded. The generation it
 * displaces becomes superseded-and-restorable itself, so a restore can be
 * undone the same way.
 */
export const POST = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const syncId = Number(id);
    if (!Number.isInteger(syncId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { error } = await db().rpc("restore_sync", { p_sync_id: syncId });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("sync_not_restorable")) {
        return NextResponse.json(
          { error: "That catalog can't be restored — its 30-day window has passed." },
          { status: 409 }
        );
      }
      // restore_sync arrives with migration 0021.
      if (/could not find the function|function .* does not exist|schema cache/i.test(msg)) {
        return NextResponse.json(
          { error: "This needs the latest library update — try again after the next deploy." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    invalidateActiveSync();
    return NextResponse.json({ ok: true });
  }
);
