import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { normalizeTitle } from "@/lib/match";

const PAGE_SIZE = 50;

/** Search the active inventory generation. */
export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ books: [], total: 0, page, pageSize: PAGE_SIZE });

  let query = db()
    .from("books")
    .select("id, title, creators, isbn13, copies, group_name", { count: "exact" })
    .eq("sync_id", active.id);

  const norm = normalizeTitle(q);
  if (norm) {
    // normalized text is [a-z0-9 ] only, safe to embed in the or() filter
    query = query.or(`title_norm.ilike.%${norm}%,creators_norm.ilike.%${norm}%`);
  }

  const { data, count, error } = await query
    .order("title", { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ books: data, total: count ?? 0, page, pageSize: PAGE_SIZE });
});
