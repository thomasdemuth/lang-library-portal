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
  // Optimistic concurrency, both optional: `baseUpdatedAt` is the map's
  // "last updated" stamp the editor loaded, and `force` says to save over
  // a newer map anyway. A payload without them behaves exactly as this
  // route always has — last write wins, no check.
  baseUpdatedAt: z.string().min(1).nullable().optional(),
  force: z.boolean().optional(),
});

/**
 * The map's "last updated" stamp, computed the same way GET /api/map does:
 * the newest of the floor-plan settings row and any shelf. Null when it
 * can't be established (empty map, database hiccup) — callers then skip
 * the version check rather than block a save on a missing timestamp.
 */
async function currentMapStamp(): Promise<string | null> {
  const [settings, newest] = await Promise.all([
    db().from("map_settings").select("updated_at").eq("id", 1).maybeSingle(),
    db().from("shelves").select("updated_at").order("updated_at", { ascending: false }).limit(1),
  ]);
  const times = [
    (settings.data as { updated_at?: string } | null)?.updated_at,
    (newest.data as { updated_at?: string }[] | null)?.[0]?.updated_at,
  ].filter(Boolean) as string[];
  if (times.length === 0) return null;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/** Bulk save from the map editor: upsert everything, delete the removed. */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "map_edit");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shelves payload" }, { status: 400 });
  }
  const { upserts, deleteIds, baseUpdatedAt, force } = parsed.data;

  // Two admins with the map open both PUT the whole shelf set, so the
  // second save would silently undo the first. If this one is based on an
  // older map than the one on the server, refuse and let the editor choose
  // (reload theirs, or re-send with force).
  if (baseUpdatedAt && !force) {
    const current = await currentMapStamp();
    const base = Date.parse(baseUpdatedAt);
    // A second of slack absorbs timestamp-precision differences; real
    // conflicts are seconds-to-minutes apart.
    if (current && Number.isFinite(base) && Date.parse(current) > base + 1000) {
      return NextResponse.json(
        {
          error: "Someone else changed the map since you opened it.",
          conflict: true,
          mapUpdatedAt: current,
        },
        { status: 409 }
      );
    }
  }

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
