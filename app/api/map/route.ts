import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/** Map data for any signed-in user; internal notes only for admins. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const isAdmin = session.aud === "admin";

  const [{ data: settings }, { data: shelves, error }] = await Promise.all([
    db().from("map_settings").select("floorplan_path, floorplan_width, floorplan_height, updated_at").eq("id", 1).maybeSingle(),
    db()
      .from("shelves")
      .select(
        `id, label, category, letter_range, details_public, x, y, w, h, rotation, sort${isAdmin ? ", notes_internal" : ""}`
      )
      .order("sort", { ascending: true }),
  ]);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({
    settings: settings ?? null,
    shelves: shelves ?? [],
    editable: isAdmin,
  });
});
