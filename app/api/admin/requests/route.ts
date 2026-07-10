import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const STATUSES = new Set(["new", "in_progress", "ordered", "ready", "declined"]);

export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const status = req.nextUrl.searchParams.get("status");
  let query = db()
    .from("book_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUSES.has(status)) query = query.eq("status", status);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const { count: newCount } = await db()
    .from("book_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return NextResponse.json({ requests: data, total: count ?? 0, newCount: newCount ?? 0 });
});
