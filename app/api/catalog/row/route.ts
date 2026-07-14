import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { attachTags, isCategoryId } from "@/lib/tags";

const ROW_SIZE = 14;
const COLS = "id, title, creators, isbn13, dedupe_key";

/**
 * One shelf-row of books for the discovery homepage. Kinds:
 *  - new:    latest additions to the active generation
 *  - random: a random sample (random ids between the generation's bounds)
 *  - tag:    a random-offset slice of one category
 * Only books with an ISBN are returned — the rows are all about covers.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const kind = req.nextUrl.searchParams.get("kind") ?? "random";
  const tagParam = req.nextUrl.searchParams.get("tag");

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ books: [] });

  if (kind === "new") {
    const { data } = await db()
      .from("books")
      .select(COLS)
      .eq("sync_id", active.id)
      .not("isbn13", "is", null)
      .order("id", { ascending: false })
      .limit(ROW_SIZE);
    return NextResponse.json({ books: await attachTags(data ?? []) });
  }

  if (kind === "tag" && isCategoryId(tagParam)) {
    try {
      const { count } = await db()
        .from("books_tagged")
        .select("id", { count: "exact", head: true })
        .eq("sync_id", active.id)
        .eq("tag", tagParam)
        .not("isbn13", "is", null);
      const total = count ?? 0;
      if (total === 0) return NextResponse.json({ books: [] });
      const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, total - ROW_SIZE)));
      const { data } = await db()
        .from("books_tagged")
        .select(`${COLS}, tag`)
        .eq("sync_id", active.id)
        .eq("tag", tagParam)
        .not("isbn13", "is", null)
        .order("title", { ascending: true })
        .range(offset, offset + ROW_SIZE - 1);
      return NextResponse.json({ books: data ?? [] });
    } catch {
      return NextResponse.json({ books: [] }); // pre-0008: no tagged rows yet
    }
  }

  // random: sample ids between the generation's bounds, keep the hits
  const [{ data: lo }, { data: hi }] = await Promise.all([
    db().from("books").select("id").eq("sync_id", active.id).order("id", { ascending: true }).limit(1).maybeSingle(),
    db().from("books").select("id").eq("sync_id", active.id).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!lo || !hi) return NextResponse.json({ books: [] });
  const ids = new Set<number>();
  while (ids.size < 60) ids.add(lo.id + Math.floor(Math.random() * (hi.id - lo.id + 1)));
  const { data } = await db()
    .from("books")
    .select(COLS)
    .eq("sync_id", active.id)
    .not("isbn13", "is", null)
    .in("id", [...ids])
    .limit(ROW_SIZE);
  return NextResponse.json({ books: await attachTags(data ?? []) });
});
