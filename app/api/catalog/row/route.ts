import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { attachTags, isCategoryId } from "@/lib/tags";
import { surnameKey } from "@/lib/shelve";
import { sampleIds } from "@/lib/sample";

const ROW_SIZE = 14;
const COLS = "id, title, creators, isbn13, dedupe_key";

/**
 * One shelf-row of books for the discovery homepage. Kinds:
 *  - new:     latest additions to the active generation
 *  - random:  a random sample (random ids between the generation's bounds)
 *  - tag:     a random-offset slice of one category
 *  - because: books like one the student read/hearted (same author, then same tag)
 *  - loved:   the books hearted by the most students
 * Only books with an ISBN are returned — the rows are all about covers.
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
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

  // "Because you read X": seed from the student's log + hearts, then find
  // more by the same author and (to fill out the shelf) the same category.
  if (kind === "because") {
    const seedIndex = Math.max(0, Math.min(5, Number(req.nextUrl.searchParams.get("i") ?? 0) || 0));
    try {
      const [{ data: reads }, favs] = await Promise.all([
        db()
          .from("reading_log")
          .select("book_key, title, created_at")
          .eq("email", session.email)
          .order("created_at", { ascending: false })
          .limit(20),
        db()
          .from("favorites")
          .select("book_key, title, created_at")
          .eq("email", session.email)
          .order("created_at", { ascending: false })
          .limit(20)
          .then((r) => r.data ?? []), // missing table → error in result, data null
      ]);
      const mine = [...(favs ?? []), ...(reads ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const seenKeys = new Set(mine.map((m) => m.book_key));
      const seeds = [...new Map(mine.map((m) => [m.book_key, m])).values()];
      const seed = seeds[seedIndex];
      if (!seed) return NextResponse.json({ books: [] });

      const { data: seedBook } = await db()
        .from("books")
        .select(COLS)
        .eq("sync_id", active.id)
        .eq("dedupe_key", seed.book_key)
        .limit(1)
        .maybeSingle();
      const [tagged] = seedBook ? await attachTags([seedBook]) : [null];

      const picks: { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string }[] = [];
      const surname = surnameKey(seedBook?.creators ?? null);
      if (surname && surname.length >= 3) {
        const { data: sameAuthor } = await db()
          .from("books")
          .select(COLS)
          .eq("sync_id", active.id)
          .not("isbn13", "is", null)
          .ilike("creators", `%${surname}%`)
          .limit(ROW_SIZE);
        for (const b of sameAuthor ?? []) picks.push(b);
      }
      if (tagged?.tag && picks.length < ROW_SIZE) {
        const { data: sameTag } = await db()
          .from("books_tagged")
          .select(COLS)
          .eq("sync_id", active.id)
          .eq("tag", tagged.tag)
          .not("isbn13", "is", null)
          .limit(ROW_SIZE * 3);
        const pool = (sameTag ?? []).sort(() => Math.random() - 0.5);
        for (const b of pool) picks.push(b);
      }
      const unique = new Map<string, (typeof picks)[number]>();
      for (const b of picks) {
        if (b.dedupe_key === seed.book_key || seenKeys.has(b.dedupe_key)) continue;
        if (!unique.has(b.dedupe_key)) unique.set(b.dedupe_key, b);
        if (unique.size >= ROW_SIZE) break;
      }
      if (unique.size === 0) return NextResponse.json({ books: [] });
      return NextResponse.json({
        seedTitle: seed.title,
        books: await attachTags([...unique.values()]),
      });
    } catch {
      return NextResponse.json({ books: [] }); // pre-0011/0012: no log yet
    }
  }

  // "Class favorites": the books hearted by the most students.
  if (kind === "loved") {
    try {
      const { data: favs, error } = await db().from("favorites").select("book_key").limit(2000);
      if (error || !favs || favs.length === 0) return NextResponse.json({ books: [] });
      const counts = new Map<string, number>();
      for (const f of favs) counts.set(f.book_key, (counts.get(f.book_key) ?? 0) + 1);
      const topKeys = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, ROW_SIZE)
        .map(([k]) => k);
      const { data } = await db()
        .from("books")
        .select(COLS)
        .eq("sync_id", active.id)
        .not("isbn13", "is", null)
        .in("dedupe_key", topKeys);
      const byKey = new Map((data ?? []).map((b) => [b.dedupe_key, b]));
      const ordered = topKeys.map((k) => byKey.get(k)).filter((b): b is NonNullable<typeof b> => Boolean(b));
      return NextResponse.json({ books: await attachTags(ordered) });
    } catch {
      return NextResponse.json({ books: [] }); // pre-0012: no favorites yet
    }
  }

  // random: sample ids between the generation's bounds, keep the hits
  const [{ data: lo }, { data: hi }] = await Promise.all([
    db().from("books").select("id").eq("sync_id", active.id).order("id", { ascending: true }).limit(1).maybeSingle(),
    db().from("books").select("id").eq("sync_id", active.id).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!lo || !hi) return NextResponse.json({ books: [] });
  const ids = sampleIds(lo.id, hi.id, 60);
  const { data } = await db()
    .from("books")
    .select(COLS)
    .eq("sync_id", active.id)
    .not("isbn13", "is", null)
    .in("id", ids)
    .limit(ROW_SIZE);
  return NextResponse.json({ books: await attachTags(data ?? []) });
});
