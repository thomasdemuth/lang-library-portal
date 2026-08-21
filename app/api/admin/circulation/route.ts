import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { getActiveSyncId } from "@/lib/active-sync";

const COLS =
  "id, book_key, title, isbn13, student_email, checked_out_by, checked_out_via, due_at, created_at, returned_at, returned_by";

function migrationPending(message: string | undefined): boolean {
  return /checkouts|relation|does not exist|schema cache/i.test(message ?? "");
}

/**
 * The circulation tab: who has what out, since when, and what came back.
 * ?view=open (default, overdue first) | returned | all, ?q= filters by
 * student or title. Also returns catalog copy counts for the open books so
 * the panel can flag titles with more out than we own.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "circulation");
  const view = req.nextUrl.searchParams.get("view") ?? "open";
  // All-literal filter text: `.or()` strings have structural syntax (commas,
  // dots between field/op/value are fine inside %…% but commas split
  // conditions), so everything outside [a-z0-9 .@-] is dropped.
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().replace(/[^a-z0-9 .@-]/g, "").replace(/,/g, "").trim();

  let query = db().from("checkouts").select(COLS).limit(300);
  if (view === "returned") query = query.not("returned_at", "is", null).order("returned_at", { ascending: false });
  else if (view === "all") query = query.order("created_at", { ascending: false });
  else query = query.is("returned_at", null).order("due_at", { ascending: true });
  if (q) query = query.or(`title.ilike.%${q}%,student_email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    if (migrationPending(error.message)) {
      return NextResponse.json({ checkouts: [], copies: {}, stats: null, migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const rows = data ?? [];

  const nowIso = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [openCount, overdueCount, returnedWeek] = await Promise.all([
    db().from("checkouts").select("id", { count: "exact", head: true }).is("returned_at", null),
    db().from("checkouts").select("id", { count: "exact", head: true }).is("returned_at", null).lt("due_at", nowIso),
    db().from("checkouts").select("id", { count: "exact", head: true }).gte("returned_at", weekAgo),
  ]);

  // Catalog copies for the listed open books (for the "more out than we own"
  // flag). Best-effort — pre-import or a vanished title just has no entry.
  const copies: Record<string, number> = {};
  const openKeys = [...new Set(rows.filter((r) => !r.returned_at).map((r) => r.book_key as string))].slice(0, 200);
  const syncId = openKeys.length ? await getActiveSyncId() : null;
  if (syncId) {
    const { data: books } = await db().from("books").select("dedupe_key, copies").eq("sync_id", syncId).in("dedupe_key", openKeys);
    for (const b of books ?? []) copies[b.dedupe_key as string] = b.copies as number;
  }

  return NextResponse.json({
    checkouts: rows,
    copies,
    stats: {
      open: openCount.count ?? 0,
      overdue: overdueCount.count ?? 0,
      returnedThisWeek: returnedWeek.count ?? 0,
    },
  });
});
