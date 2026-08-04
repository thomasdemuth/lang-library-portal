import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

export type SyncPreview = {
  added: number;
  removed: number;
  unchanged: number;
  /** Titles added by hand since the last import that the new file would drop. */
  manualMissing: number;
  /** Up to 20 of those titles, alphabetical. */
  manualTitles: string[];
};

/** The diff RPC arrives with migration 0021 — recognise a DB without it. */
function functionMissing(message: string | undefined): boolean {
  return /could not find the function|function .* does not exist|schema cache/i.test(message ?? "");
}

/**
 * Diff a staged (pending) import against the live catalog, by dedupe_key,
 * so the importer can confirm before anything is replaced. Read-only: the
 * pending rows are already uploaded, nothing is committed here.
 */
export const GET = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const syncId = Number(id);
    if (!Number.isInteger(syncId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { data: sync } = await db()
      .from("inventory_syncs")
      .select("id, status")
      .eq("id", syncId)
      .maybeSingle();
    if (!sync || sync.status !== "pending") {
      return NextResponse.json({ error: "That import is no longer open" }, { status: 409 });
    }

    const { data, error } = await db().rpc("diff_pending_sync", { p_sync_id: syncId });
    if (error) {
      // Pre-0021 database: no diff available, but importing must still work.
      // The panel shows a plain confirmation instead of the numbers.
      if (functionMissing(error.message)) {
        return NextResponse.json({ preview: null, migrationPending: true });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const preview: SyncPreview = {
      added: Number(row?.added ?? 0),
      removed: Number(row?.removed ?? 0),
      unchanged: Number(row?.unchanged ?? 0),
      manualMissing: Number(row?.manual_missing ?? 0),
      manualTitles: Array.isArray(row?.manual_titles) ? row.manual_titles.slice(0, 20) : [],
    };
    return NextResponse.json({ preview });
  }
);
