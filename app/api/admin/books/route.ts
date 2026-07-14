import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { normalizeTitle } from "@/lib/match";
import { attachTags, isCategoryId } from "@/lib/tags";

const PAGE_SIZE = 50;

/** Search the active inventory generation, optionally filtered by tag. */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);
  const tagParam = req.nextUrl.searchParams.get("tag");
  const tag = isCategoryId(tagParam) ? tagParam : null;

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ books: [], total: 0, page, pageSize: PAGE_SIZE });

  // Tag filtering goes through the books_tagged view (books ⋈ book_tags);
  // untagged browsing keeps hitting the base table so it works pre-0008.
  const cols = "id, title, creators, isbn13, copies, group_name, dedupe_key";
  let query = tag
    ? db().from("books_tagged").select(`${cols}, tag`, { count: "exact" }).eq("tag", tag)
    : db().from("books").select(cols, { count: "exact" });
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
    if (tag && /books_tagged|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json(
        { error: "Tag filters need the pending database migration — run 0008 in Supabase." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    books: tag ? data : await attachTags(data ?? []),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
});
