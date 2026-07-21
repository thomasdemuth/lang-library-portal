import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/**
 * Where the games live on the map: the games area(s) — shelves tagged with
 * the "games" map category. Reuses the same /map?shelf= highlight the book
 * "Where is it?" flow uses. Returns the first games area if there is one.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const { data, error } = await db()
    .from("shelves")
    .select("id, label, shelf_number")
    .eq("category", "games")
    .order("sort", { ascending: true })
    .limit(1);
  if (error) return NextResponse.json({ found: false });
  const shelf = data?.[0];
  if (!shelf) return NextResponse.json({ found: false });
  return NextResponse.json({ found: true, shelfId: shelf.id, label: shelf.label, shelf_number: shelf.shelf_number });
});
