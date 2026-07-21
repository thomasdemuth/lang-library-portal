import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { normalizeGameTitle } from "@/lib/games";

const COLS = "id, title, subcategory, description, image_url, copies, condition, location, available";

function missingTable(message: string | undefined): boolean {
  return /games|relation|does not exist|schema cache/i.test(message ?? "");
}

/**
 * The games collection for the student & staff portals — every game, ordered
 * by sub-category then title, so the client can lay them out one row per
 * sub-category. Optional ?q= filters by title. Separate table from books;
 * games never appear in book searches and vice versa.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);

  let query = db().from("games").select(COLS).order("subcategory").order("title");
  const norm = normalizeGameTitle(q);
  if (norm) query = query.ilike("title_norm", `%${norm}%`);

  const { data, error } = await query;
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ games: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ games: data ?? [] });
});
