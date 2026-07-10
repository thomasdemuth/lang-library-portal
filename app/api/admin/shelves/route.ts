import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { CATEGORY_IDS } from "@/lib/categories";

const Shelf = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  letter_range: z.string().trim().max(40).nullable(),
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
  const admin = await requireAdmin(req);
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
    const { error } = await db()
      .from("shelves")
      .upsert(
        upserts.map((s) => ({ ...s, updated_at: now, updated_by: admin.id })),
        { onConflict: "id" }
      );
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: upserts.length, deleted: deleteIds.length });
});
