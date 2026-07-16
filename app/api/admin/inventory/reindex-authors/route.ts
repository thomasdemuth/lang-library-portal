import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { authorSortKey } from "@/lib/shelve";

const PAGE = 1000;

/**
 * Backfill author_sort for the whole active generation, so books already
 * imported (before migration 0014) sort by author without a re-import.
 * Future imports compute it at ingest. Idempotent — safe to run anytime.
 */
export const POST = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_import");

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ ok: true, updated: 0 });

  let from = 0;
  let updated = 0;
  for (;;) {
    const { data, error } = await db()
      .from("books")
      .select("id, creators")
      .eq("sync_id", active.id)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/author_sort|column/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "Run migration 0014 first (adds books.author_sort)." }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!data || data.length === 0) break;

    const payload = data.map((b) => ({ id: b.id, author_sort: authorSortKey(b.creators) }));
    const { error: rpcErr } = await db().rpc("set_author_sorts", { p: payload });
    if (rpcErr) {
      if (/set_author_sorts|function|does not exist|author_sort|column/i.test(rpcErr.message ?? "")) {
        return NextResponse.json({ error: "Run migration 0014 first (adds books.author_sort)." }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    updated += payload.length;
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ ok: true, updated });
});
