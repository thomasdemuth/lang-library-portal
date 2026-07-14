import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { suggestTag, type Suggestion } from "@/lib/autotag";
import type { CategoryId } from "@/lib/categories";

/** Subject headings for an ISBN: Open Library first, Google Books fallback. */
async function externalSubjects(isbn: string | null): Promise<string[]> {
  if (!isbn) return [];
  try {
    const ol = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "LangLibraryPortal/1.0" } }
    ).then((r) => (r.ok ? r.json() : null));
    const olSubjects: string[] =
      ol?.[`ISBN:${isbn}`]?.subjects?.map((s: { name?: string } | string) =>
        typeof s === "string" ? s : s.name ?? ""
      ) ?? [];
    if (olSubjects.length > 0) return olSubjects.slice(0, 40);
  } catch {
    /* fall through */
  }
  try {
    const gb = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&country=US`,
      { signal: AbortSignal.timeout(5000) }
    ).then((r) => (r.ok ? r.json() : null));
    return (gb?.items?.[0]?.volumeInfo?.categories ?? []).slice(0, 40);
  } catch {
    return [];
  }
}

/** The most common tag among this author's other, already-tagged books. */
async function authorSignal(
  creatorsNorm: string | null,
  excludeKey: string
): Promise<{ tag: CategoryId; count: number } | null> {
  if (!creatorsNorm) return null;
  try {
    const { data, error } = await db()
      .from("books_tagged")
      .select("tag, dedupe_key")
      .eq("creators_norm", creatorsNorm)
      .not("tag", "is", null)
      .neq("dedupe_key", excludeKey)
      .limit(10);
    if (error || !data?.length) return null;
    const counts = new Map<CategoryId, number>();
    for (const row of data) counts.set(row.tag as CategoryId, (counts.get(row.tag as CategoryId) ?? 0) + 1);
    const [tag, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { tag, count };
  } catch {
    return null; // pre-0008 (no view) — just skip this signal
  }
}

/** Suggest a category tag for one book, with a confidence estimate. */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ suggestion: null });

  const { data: book } = await db()
    .from("books")
    .select("title, creators, creators_norm, isbn13, isbn10, dedupe_key")
    .eq("sync_id", active.id)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (!book) return NextResponse.json({ suggestion: null });

  const [subjects, author] = await Promise.all([
    externalSubjects(book.isbn13 ?? book.isbn10),
    authorSignal(book.creators_norm, book.dedupe_key),
  ]);

  const suggestion: Suggestion | null = suggestTag(subjects, {
    authorTag: author?.tag ?? null,
    authorTagCount: author?.count ?? 0,
  });
  return NextResponse.json({ suggestion });
});
