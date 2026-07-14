import { db } from "@/lib/db";
import { normalizeTitle } from "@/lib/match";
import { attachTags } from "@/lib/tags";
import { resolveShelf, type ShelfInfo } from "@/lib/shelve";
import type { CategoryId } from "@/lib/categories";

export const PAGE_SIZE = 50;

type SearchOpts = { q: string; tag: CategoryId | null; untagged?: boolean; page: number };
type SearchResult =
  | { ok: true; books: unknown[]; total: number; page: number; pageSize: number }
  | { ok: false; status: number; error: string };

/** Search the active generation — shared by the admin and student catalogs. */
export async function searchCatalog({ q, tag, untagged = false, page }: SearchOpts): Promise<SearchResult> {
  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return { ok: true, books: [], total: 0, page, pageSize: PAGE_SIZE };

  // Tag filtering (and the untagged review queue) go through the
  // books_tagged view (books ⋈ book_tags); plain browsing keeps hitting
  // the base table so it works pre-0008.
  const cols = "id, title, creators, isbn13, copies, group_name, dedupe_key";
  let query =
    tag || untagged
      ? db().from("books_tagged").select(`${cols}, tag`, { count: "exact" })
      : db().from("books").select(cols, { count: "exact" });
  if (tag) query = query.eq("tag", tag);
  else if (untagged) query = query.is("tag", null);
  query = query.eq("sync_id", active.id);

  const norm = normalizeTitle(q);
  if (norm) {
    // normalized text is [a-z0-9 ] only, safe to embed in the or() filter
    query = query.or(`title_norm.ilike.%${norm}%,creators_norm.ilike.%${norm}%`);
  }

  const { data, count, error } = await query
    .order("title", { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) {
    if ((tag || untagged) && /books_tagged|relation|does not exist/i.test(error.message ?? "")) {
      return { ok: false, status: 409, error: "Tag filters need the pending database migration — run 0008 in Supabase." };
    }
    return { ok: false, status: 500, error: "Database error" };
  }

  return {
    ok: true,
    books: tag || untagged ? (data ?? []) : await attachTags(data ?? []),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export type WhereResult =
  | { found: true; ranged: boolean; tag: CategoryId; shelves: { id: string; label: string; shelf_number: string | null; letter_range: string | null }[] }
  | { found: false; reason: "no-inventory" | "no-book" | "untagged" | "no-shelf"; tag?: CategoryId };

/** Which shelf a book lives on (via its tag + the map's ranges). */
export async function whereIsBook(key: string): Promise<WhereResult | { error: string }> {
  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return { found: false, reason: "no-inventory" };

  const { data: book } = await db()
    .from("books")
    .select("id, title, creators, dedupe_key")
    .eq("sync_id", active.id)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (!book) return { found: false, reason: "no-book" };

  const [tagged] = await attachTags([book]);
  if (!tagged.tag) return { found: false, reason: "untagged" };

  const { data: shelves, error } = await db()
    .from("shelves")
    .select("id, label, category, letter_range, shelf_number");
  if (error) return { error: "Database error" };

  const match = resolveShelf(tagged.tag, book.creators, (shelves ?? []) as ShelfInfo[]);
  if (match.shelves.length === 0) return { found: false, reason: "no-shelf", tag: tagged.tag };

  return {
    found: true,
    ranged: match.ranged,
    tag: tagged.tag,
    shelves: match.shelves.map((s) => ({
      id: s.id,
      label: s.label,
      shelf_number: s.shelf_number,
      letter_range: s.letter_range,
    })),
  };
}
