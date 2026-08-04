import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin, requirePermission } from "@/lib/guards";
import { canDo } from "@/lib/permissions";

const CreateBody = z.object({ source_filename: z.string().trim().max(200).optional() });

/** Start a new pending inventory generation. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "inventory_import");
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));

  // Only one pending sync at a time: abort any stale ones first.
  const { data: stale } = await db().from("inventory_syncs").select("id").eq("status", "pending");
  if (stale && stale.length > 0) {
    const ids = stale.map((s) => s.id);
    await db().from("books").delete().in("sync_id", ids);
    await db().from("inventory_syncs").update({ status: "aborted" }).in("id", ids);
  }

  const { data, error } = await db()
    .from("inventory_syncs")
    .insert({
      source_filename: parsed.success ? parsed.data.source_filename ?? null : null,
      started_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ sync_id: data.id });
});

type SyncRow = {
  id: number;
  status: string;
  source_filename: string | null;
  row_count: number | null;
  merged_count: number | null;
  started_at: string;
  activated_at: string | null;
  superseded_at?: string | null;
  pruned_at?: string | null;
};

/** Sync history + the active generation's book count. */
export const GET = guarded(async (req: NextRequest) => {
  // Either inventory power may read the history — importers need it for the
  // Import history / Restore panel even without the search permission.
  const admin = await requireAdmin(req);
  if (!canDo(admin, "inventory_view") && !canDo(admin, "inventory_import")) {
    return NextResponse.json({ error: "You don't have permission for that." }, { status: 403 });
  }
  const base = "id, status, source_filename, row_count, merged_count, started_at, activated_at";
  // superseded_at / pruned_at arrive with migration 0021 — fall back to the
  // base columns (no restore offered) on a database that predates it.
  const first = await db()
    .from("inventory_syncs")
    .select(`${base}, superseded_at, pruned_at`)
    .order("started_at", { ascending: false })
    .limit(20);
  let syncs = first.data as SyncRow[] | null;
  let error = first.error;
  if (error && /column|superseded_at|pruned_at/i.test(error.message ?? "")) {
    const retry = await db()
      .from("inventory_syncs")
      .select(base)
      .order("started_at", { ascending: false })
      .limit(20);
    syncs = retry.data as SyncRow[] | null;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const rows = syncs ?? [];
  const active = rows.find((s) => s.status === "active") ?? null;
  let bookCount = 0;
  if (active) {
    const { count } = await db()
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("sync_id", active.id);
    bookCount = count ?? 0;
  }

  // The one generation "Restore" may target: the most recently superseded
  // sync whose books are still kept (30-day window, not yet pruned).
  let restorableId: number | null = null;
  const candidate = rows
    .filter((s) => s.status === "superseded" && s.superseded_at && !s.pruned_at)
    .sort((a, b) => (b.superseded_at ?? "").localeCompare(a.superseded_at ?? ""))[0];
  if (candidate) {
    const { count } = await db()
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("sync_id", candidate.id);
    if ((count ?? 0) > 0) restorableId = candidate.id;
  }

  return NextResponse.json({ syncs: rows, active, bookCount, restorableId });
});
