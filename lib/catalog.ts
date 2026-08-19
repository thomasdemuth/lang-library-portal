import { db } from "@/lib/db";
import { getActiveSyncId } from "@/lib/active-sync";
import { normalizeTitle } from "@/lib/match";
import { attachTags } from "@/lib/tags";
import { resolveShelf, type ShelfInfo } from "@/lib/shelve";
import type { CategoryId, MapCategoryId } from "@/lib/categories";

export const PAGE_SIZE = 50;

/**
 * Who the results are for, where books marked for teachers are concerned:
 *   "hide" — students and guests: teacher books do not exist for them
 *   "only" — the Books for Teachers surfaces
 *   "all"  — staff and management browsing the whole collection
 * This has to be applied inside the query, not after it: filtering the page
 * afterwards would leave the totals and page counts describing a result set
 * the caller never sees.
 */
export type TeacherScope = "hide" | "only" | "all";

type SearchOpts = {
  q: string;
  tag: CategoryId | null;
  untagged?: boolean;
  teachers?: TeacherScope;
  page: number;
  sort?: "title" | "author";
};
type SearchResult =
  | { ok: true; books: unknown[]; total: number; page: number; pageSize: number }
  | { ok: false; status: number; error: string };

/** Search the active generation — shared by the admin and student catalogs. */
export async function searchCatalog({
  q,
  tag,
  untagged = false,
  teachers = "all",
  page,
  sort = "title",
}: SearchOpts): Promise<SearchResult> {
  const activeId = await getActiveSyncId();
  if (!activeId) return { ok: true, books: [], total: 0, page, pageSize: PAGE_SIZE };

  const norm = normalizeTitle(q);

  // Non-empty query → the fuzzy + full-text RPC (migration 0018): tolerates
  // typos, out-of-order words, author+title mixed, partials, and stems. Falls
  // through to the legacy substring search if 0018 hasn't run yet.
  if (norm) {
    const { data, error } = await db().rpc("search_books", {
      p_q: q,
      p_qnorm: norm,
      p_sync_id: activeId,
      p_tag: tag ?? null,
      p_untagged: untagged,
      p_hide_teachers: teachers === "hide",
      p_teachers_only: teachers === "only",
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (!error) {
      const rows = (data ?? []) as Array<Record<string, unknown> & { total_count?: number | string }>;
      const total = rows.length ? Number(rows[0].total_count ?? 0) : 0;
      const books = rows.map(({ total_count: _drop, ...b }) => b);
      return { ok: true, books, total, page, pageSize: PAGE_SIZE };
    }
    const missing =
      error.code === "PGRST202" ||
      /could not find the function|schema cache|does not exist|search_books/i.test(error.message ?? "");
    if (!missing) return { ok: false, status: 500, error: "Database error" };
    // else: 0018 not applied yet — fall through to the legacy search below.
  }

  // Legacy path: plain browsing (empty query) and the pre-0018 substring
  // search. Tag filtering (and the untagged review queue) go through the
  // books_tagged view (books ⋈ book_tags); plain browsing keeps hitting the
  // base table so it works pre-0008. Rebuilt fresh for each attempt since a
  // PostgREST query can't be re-run after it executes.
  const cols = "id, title, creators, isbn13, copies, group_name, dedupe_key";
  // `scoped` = anything that needs the tag join. Teacher scoping counts:
  // hiding or isolating those books is a filter on book_tags, same as a
  // category filter, so it has to go through the view rather than the base
  // table. `viewFailed` drops the teacher clause if migration 0026 hasn't run
  // — safe, because before it no book can carry the flag in the first place.
  let viewFailed = false;
  const build = (orderBy: "title" | "author_sort") => {
    const scopeTeachers = teachers !== "all" && !viewFailed;
    const scoped = Boolean(tag) || untagged || scopeTeachers;
    let query = scoped
      ? db().from("books_tagged").select(`${cols}, tag, teachers`, { count: "exact" })
      : db().from("books").select(cols, { count: "exact" });
    if (tag) query = query.eq("tag", tag);
    else if (untagged) query = query.is("tag", null);
    if (scopeTeachers) query = query.eq("teachers", teachers === "only");
    query = query.eq("sync_id", activeId);
    // normalized text is [a-z0-9 ] only, safe to embed in the or() filter
    if (norm) query = query.or(`title_norm.ilike.%${norm}%,creators_norm.ilike.%${norm}%`);
    if (orderBy === "author_sort") query = query.order("author_sort", { ascending: true, nullsFirst: false });
    return query.order("title", { ascending: true }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  };

  let { data, count, error } = await build(sort === "author" ? "author_sort" : "title");
  // author_sort arrives with migration 0014 — fall back to title order before then
  if (error && sort === "author" && /author_sort|column/i.test(error.message ?? "")) {
    ({ data, count, error } = await build("title"));
  }
  // The teachers column arrives with 0026; before it, run the query without
  // that clause rather than failing the whole search.
  if (error && teachers !== "all" && /teachers|column/i.test(error.message ?? "")) {
    viewFailed = true;
    // "only" has nothing to list pre-0026 — no book can be flagged yet.
    if (teachers === "only") return { ok: true, books: [], total: 0, page, pageSize: PAGE_SIZE };
    ({ data, count, error } = await build(sort === "author" ? "author_sort" : "title"));
  }
  if (error) {
    if ((tag || untagged) && /books_tagged|relation|does not exist/i.test(error.message ?? "")) {
      return { ok: false, status: 409, error: "Tag filters need the pending database migration — run 0008 in Supabase." };
    }
    return { ok: false, status: 500, error: "Database error" };
  }

  return {
    ok: true,
    books: tag || untagged || (teachers !== "all" && !viewFailed) ? (data ?? []) : await attachTags(data ?? []),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export type WhereResult =
  | { found: true; ranged: boolean; tag: MapCategoryId; shelves: { id: string; label: string; shelf_number: string | null; letter_range: string | null }[] }
  | { found: false; reason: "no-inventory" | "no-book" | "untagged" | "no-shelf"; tag?: MapCategoryId };

/**
 * Which shelf a book lives on (via its tag + the map's ranges).
 *
 * `teachers: "hide"` makes a book marked for teachers answer exactly as a
 * book the library doesn't own — a student who somehow has the key must not
 * be told where to walk.
 *
 * For everyone else, the Teachers flag decides the LOCATION: these books are
 * pulled out of the ordinary shelves and kept together, so a title that is
 * both Fiction and for teachers is found in the Teachers area, not under F.
 */
export async function whereIsBook(
  key: string,
  teachers: TeacherScope = "all"
): Promise<WhereResult | { error: string }> {
  const activeId = await getActiveSyncId();
  if (!activeId) return { found: false, reason: "no-inventory" };

  const { data: book } = await db()
    .from("books")
    .select("id, title, creators, dedupe_key")
    .eq("sync_id", activeId)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (!book) return { found: false, reason: "no-book" };

  const [tagged] = await attachTags([book]);
  if (tagged.teachers && teachers === "hide") return { found: false, reason: "no-book" };
  const locatedBy: MapCategoryId | null = tagged.teachers ? "teachers" : tagged.tag;
  if (!locatedBy) return { found: false, reason: "untagged" };

  // Ordered, because the answer is presented to a student as a place to walk
  // to: when the book resolves to several candidate shelves (no letter range
  // narrowed it down) the first one is the one we name, and an unordered read
  // would name a different shelf on every tap.
  const { data: shelves, error } = await db()
    .from("shelves")
    .select("id, label, category, letter_range, shelf_number")
    .order("sort", { ascending: true })
    .order("shelf_number", { ascending: true, nullsFirst: false })
    .order("label", { ascending: true });
  if (error) return { error: "Database error" };

  const match = resolveShelf(locatedBy, book.creators, (shelves ?? []) as ShelfInfo[]);
  if (match.shelves.length === 0) return { found: false, reason: "no-shelf", tag: locatedBy };

  return {
    found: true,
    ranged: match.ranged,
    tag: locatedBy,
    shelves: match.shelves.map((s) => ({
      id: s.id,
      label: s.label,
      shelf_number: s.shelf_number,
      letter_range: s.letter_range,
    })),
  };
}
