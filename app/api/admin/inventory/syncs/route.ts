import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireDeveloper, requirePermission } from "@/lib/guards";

const CreateBody = z.object({ source_filename: z.string().trim().max(200).optional() });

/** Start a new pending inventory generation. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireDeveloper(req);
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

/** Sync history + the active generation's book count. */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const { data: syncs, error } = await db()
    .from("inventory_syncs")
    .select("id, status, source_filename, row_count, merged_count, started_at, activated_at")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const active = syncs?.find((s) => s.status === "active") ?? null;
  let bookCount = 0;
  if (active) {
    const { count } = await db()
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("sync_id", active.id);
    bookCount = count ?? 0;
  }
  return NextResponse.json({ syncs, active, bookCount });
});
