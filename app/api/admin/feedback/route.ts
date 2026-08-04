import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const STATUSES = new Set(["new", "read", "archived"]);
const PAGE_SIZE = 50;

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "feedback_view");
  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10) || 0);

  let query = db()
    .from("feedback")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (status && STATUSES.has(status)) query = query.eq("status", status);
  if (q) query = query.ilike("message", `%${escapeLike(q)}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  const { count: newCount } = await db()
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return NextResponse.json({
    feedback: data,
    newCount: newCount ?? 0,
    total: count ?? (data?.length ?? 0),
    pageSize: PAGE_SIZE,
  });
});
