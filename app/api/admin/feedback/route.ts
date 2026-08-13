import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { isTopic, TOPICS, type Topic } from "@/lib/feedback";

const STATUSES = new Set(["new", "read", "archived"]);
const PAGE_SIZE = 50;

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type StatRow = { topic: string; n: number; avg_rating: number | null };
export type TopicStats = Record<Topic, { count: number; average: number }>;

/**
 * Star counts and averages per topic, for the summary line above the queue.
 * Aggregated by feedback_rating_stats() in the database (migration 0024);
 * returns null when that function isn't there yet, so a deploy ahead of the
 * SQL just omits the summary instead of erroring the page.
 */
async function ratingStats(): Promise<TopicStats | null> {
  const { data, error } = await db().rpc("feedback_rating_stats");
  if (error) return null;

  const byTopic = new Map((((data ?? []) as StatRow[]) ?? []).map((r) => [r.topic, r]));
  return Object.fromEntries(
    TOPICS.map((topic) => {
      const row = byTopic.get(topic);
      return [topic, { count: Number(row?.n ?? 0), average: Number(row?.avg_rating ?? 0) }];
    })
  ) as TopicStats;
}

export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "feedback_view");
  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const topic = params.get("topic");
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10) || 0);

  let query = db()
    .from("feedback")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (status && STATUSES.has(status)) query = query.eq("status", status);
  if (isTopic(topic)) query = query.eq("topic", topic);
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
    stats: await ratingStats(),
  });
});
