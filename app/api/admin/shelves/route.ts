import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { MAP_CATEGORY_IDS } from "@/lib/categories";

const Shelf = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  category: z.enum(MAP_CATEGORY_IDS as [string, ...string[]]),
  letter_range: z.string().trim().max(40).nullable(),
  shelf_number: z.string().trim().max(40).nullable(),
  details_public: z.string().trim().max(1000).nullable(),
  notes_internal: z.string().trim().max(2000).nullable(),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().min(1),
  h: z.number().finite().min(1),
  rotation: z.number().finite().min(-360).max(360),
  sort: z.number().int().min(0).max(100000),
});

const Body = z.object({
  upserts: z.array(Shelf).max(500),
  deleteIds: z.array(z.string().uuid()).max(500),
});

/** Bulk save from the map editor: upsert everything, delete the removed. */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "map_edit");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shelves payload" }, { status: 400 });
  }
  const { upserts, deleteIds } = parsed.data;

  if (deleteIds.length > 0) {
    const { error } = await db().from("shelves").delete().in("id", deleteIds);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (upserts.length > 0) {
    const now = new Date().toISOString();
    const rows = upserts.map((s) => ({ ...s, updated_at: now, updated_by: admin.id }));
    let { error } = await db().from("shelves").upsert(rows, { onConflict: "id" });
    // Resilience: if the shelf_number migration hasn't run yet, drop it and retry.
    if (error && /shelf_number/.test(error.message ?? "")) {
      const stripped = rows.map(({ shelf_number: _drop, ...rest }) => rest);
      ({ error } = await db().from("shelves").upsert(stripped, { onConflict: "id" }));
    }
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: upserts.length, deleted: deleteIds.length });
});
