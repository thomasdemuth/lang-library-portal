import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { getActiveSyncId } from "@/lib/active-sync";
import { attachTags, hidesTeacherBooks, isCategoryId } from "@/lib/tags";
import { surnameOf } from "@/lib/shelve";
import { normalizeCreators } from "@/lib/match";
import { sampleIds } from "@/lib/sample";

const ROW_SIZE = 14;
const COLS = "id, title, creators, isbn13, dedupe_key";

/**
 * The most-hearted book keys, highest first. Grouped in the database by
 * top_loved() (migration 0019); before that ran, this read a 2,000-row slice
 * of favorites and counted in JS — which silently mis-ranked the row once the
 * table outgrew the cap. That slice stays here as the pre-0019 fallback.
 */
async function topLovedKeys(limit: number): Promise<string[]> {
  const { data, error } = await db().rpc("top_loved", { p_limit: limit });
  if (!error) return ((data ?? []) as { book_key: string }[]).map((r) => r.book_key);
  const rpcMissing =
    error.code === "PGRST202" ||
    /could not find the function|schema cache|does not exist|top_loved/i.test(error.message ?? "");
  if (!rpcMissing) return [];

  const { data: favs, error: favErr } = await db().from("favorites").select("book_key").limit(2000);
  if (favErr || !favs || favs.length === 0) return [];
  const counts = new Map<string, number>();
  for (const f of favs) counts.set(f.book_key, (counts.get(f.book_key) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * One shelf-row of books for the discovery homepage. Kinds:
 *  - new:     latest additions to the active generation
 *  - random:  a random sample (random ids between the generation's bounds)
 *  - tag:     a random-offset slice of one category
 *  - because: books like one the student read/hearted (same author, then same tag)
 *  - loved:   the books hearted by the most students
 * Only books with an ISBN are returned — the rows are all about covers.
 */
async function shelfRow(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  const kind = req.nextUrl.searchParams.get("kind") ?? "random";
  const tagParam = req.nextUrl.searchParams.get("tag");

  // Every row goes out through this, so a book marked for teachers can't
  // reach a student through any of the five kinds. Filtering here rather than
  // in each query keeps the rule in one place, and costs nothing: these rows
  // are ~14 books and carry no totals to keep consistent. A row that loses a
  // book to the filter is simply a little shorter.
  const hide = hidesTeacherBooks(session.aud);
  const visible = async <T extends { dedupe_key: string }>(rows: T[]) => {
    const tagged = await attachTags(rows);
    return hide ? tagged.filter((b) => !b.teachers) : tagged;
  };

  const activeId = await getActiveSyncId();
  if (!activeId) return NextResponse.json({ books: [] });

  if (kind === "new") {
    const { data } = await db()
      .from("books")
      .select(COLS)
      .eq("sync_id", activeId)
      .not("isbn13", "is", null)
      .order("id", { ascending: false })
      .limit(ROW_SIZE);
    return NextResponse.json({ books: await visible(data ?? []) });
  }

  if (kind === "tag" && isCategoryId(tagParam)) {
    try {
      const { count } = await db()
        .from("books_tagged")
        .select("id", { count: "exact", head: true })
        .eq("sync_id", activeId)
        .eq("tag", tagParam)
        .not("isbn13", "is", null);
      const total = count ?? 0;
      if (total === 0) return NextResponse.json({ books: [] });
      const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, total - ROW_SIZE)));
      const { data } = await db()
        .from("books_tagged")
        .select(`${COLS}, tag`)
        .eq("sync_id", activeId)
        .eq("tag", tagParam)
        .not("isbn13", "is", null)
        .order("title", { ascending: true })
        .range(offset, offset + ROW_SIZE - 1);
      return NextResponse.json({ books: await visible(data ?? []) });
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
        .eq("sync_id", activeId)
        .eq("dedupe_key", seed.book_key)
        .limit(1)
        .maybeSingle();
      const [tagged] = seedBook ? await attachTags([seedBook]) : [null];

      const picks: { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string }[] = [];
      // Same author: matched against creators_norm, the same normalization the
      // importer wrote (lowercase, accents and apostrophes folded away), NOT
      // the raw creators column — "O'Dell", "Muñoz Ryan" and "García Márquez"
      // never survive a raw-column comparison, so those authors used to fall
      // straight through to the category filler. Normalized text is
      // [a-z0-9 ] only, so it's safe to embed in the pattern.
      const surname = normalizeCreators(surnameOf(seedBook?.creators ?? null) ?? "");
      if (surname.length >= 3) {
        const { data: sameAuthor } = await db()
          .from("books")
          .select(COLS)
          .eq("sync_id", activeId)
          .not("isbn13", "is", null)
          .ilike("creators_norm", `%${surname}%`)
          .limit(ROW_SIZE);
        for (const b of sameAuthor ?? []) picks.push(b);
      }
      if (tagged?.tag && picks.length < ROW_SIZE) {
        const { data: sameTag } = await db()
          .from("books_tagged")
          .select(COLS)
          .eq("sync_id", activeId)
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
        books: await visible([...unique.values()]),
      });
    } catch {
      return NextResponse.json({ books: [] }); // pre-0011/0012: no log yet
    }
  }

  // "Class favorites": the books hearted by the most students.
  if (kind === "loved") {
    try {
      const topKeys = await topLovedKeys(ROW_SIZE);
      if (topKeys.length === 0) return NextResponse.json({ books: [] });
      const { data } = await db()
        .from("books")
        .select(COLS)
        .eq("sync_id", activeId)
        .not("isbn13", "is", null)
        .in("dedupe_key", topKeys);
      const byKey = new Map((data ?? []).map((b) => [b.dedupe_key, b]));
      const ordered = topKeys.map((k) => byKey.get(k)).filter((b): b is NonNullable<typeof b> => Boolean(b));
      return NextResponse.json({ books: await visible(ordered) });
    } catch {
      return NextResponse.json({ books: [] }); // pre-0012: no favorites yet
    }
  }

  // random: sample ids between the generation's bounds, keep the hits
  const [{ data: lo }, { data: hi }] = await Promise.all([
    db().from("books").select("id").eq("sync_id", activeId).order("id", { ascending: true }).limit(1).maybeSingle(),
    db().from("books").select("id").eq("sync_id", activeId).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!lo || !hi) return NextResponse.json({ books: [] });
  const ids = sampleIds(lo.id, hi.id, 60);
  const { data } = await db()
    .from("books")
    .select(COLS)
    .eq("sync_id", activeId)
    .not("isbn13", "is", null)
    .in("id", ids)
    .limit(ROW_SIZE);
  return NextResponse.json({ books: await visible(data ?? []) });
}

// "because" is seeded from the signed-in student's own reads and hearts, and
// the random/tag rows reshuffle per request, so the row is per-browser and
// short-lived — never a shared cache.
export const GET = guarded(async (req: NextRequest) => {
  const res = await shelfRow(req);
  if (res.ok) res.headers.set("Cache-Control", "private, max-age=60");
  return res;
});
