import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/** Map data for any signed-in user; internal notes only for admins. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const isAdmin = session.aud === "admin";

  const base = `id, label, category, letter_range, details_public, shelf_number, x, y, w, h, rotation, sort, updated_at${
    isAdmin ? ", notes_internal" : ""
  }`;

  const [{ data: settings }, shelvesRes] = await Promise.all([
    db()
      .from("map_settings")
      .select("floorplan_path, floorplan_width, floorplan_height, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    db().from("shelves").select(base).order("sort", { ascending: true }),
  ]);

  let shelves = shelvesRes.data;
  // Resilience: if the shelf_number migration hasn't run yet, retry without it.
  if (shelvesRes.error) {
    const retry = await db()
      .from("shelves")
      .select(base.replace(", shelf_number", ""))
      .order("sort", { ascending: true });
    if (retry.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    shelves = retry.data;
  }

  // "Map last updated" = newest of the floor plan and any shelf edit.
  const times = [
    settings?.updated_at,
    ...(shelves ?? []).map((s) => (s as { updated_at?: string }).updated_at),
  ].filter(Boolean) as string[];
  const mapUpdatedAt = times.length
    ? times.reduce((a, b) => (a > b ? a : b))
    : null;

  return NextResponse.json({
    settings: settings ?? null,
    shelves: shelves ?? [],
    mapUpdatedAt,
    editable: isAdmin,
  });
});
