import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const STATUSES = new Set(["new", "read", "archived"]);

export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const status = req.nextUrl.searchParams.get("status");
  let query = db()
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUSES.has(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  const { count: newCount } = await db()
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return NextResponse.json({ feedback: data, newCount: newCount ?? 0 });
});
