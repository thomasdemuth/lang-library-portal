import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { searchGames } from "@/lib/games-search";

/**
 * The games collection for the student & staff portals — every game, ordered
 * by sub-category then title, so the client can lay them out one row per
 * sub-category. Optional ?q= runs the fuzzy + full-text search. Separate table
 * from books; games never appear in book searches and vice versa.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);

  const result = await searchGames({ q, subcategory: null, order: "subcategory" });
  if (result.ok) return NextResponse.json({ games: result.games });
  if ("migrationPending" in result) return NextResponse.json({ games: [], migrationPending: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
});
