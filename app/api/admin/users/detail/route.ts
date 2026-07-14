import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const SERIES_DAYS = 30;

function isoDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Everything about one account: student profile (if any), reading log,
 * favorites, book requests, internal notes, and the page-view activity
 * log with a daily interactions series for the chart.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "users");
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 200) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Student profile — tolerate every migration stage
  let profile: Record<string, unknown> | null = null;
  {
    let { data, error } = await db()
      .from("student_profiles")
      .select("avatar, points, public_id, hidden, created_at")
      .eq("email", email)
      .maybeSingle();
    if (error && /public_id|hidden/i.test(error.message ?? "")) {
      ({ data, error } = await db()
        .from("student_profiles")
        .select("avatar, points, created_at")
        .eq("email", email)
        .maybeSingle());
    }
    if (!error && data) profile = data;
  }

  const [reads, favorites, requests, notes, views] = await Promise.all([
    db()
      .from("reading_log")
      .select("id, title, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r) => r.data ?? []),
    db()
      .from("favorites")
      .select("book_key, title, isbn13, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r) => r.data ?? []),
    db()
      .from("book_requests")
      .select("id, title, author, copies_requested, status, needed_by, created_at")
      .eq("requester_email", email)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
    db()
      .from("account_notes")
      .select("id, author, body, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
    db()
      .from("usage_events")
      .select("path, audience, ts")
      .eq("email", email)
      .order("ts", { ascending: false })
      .limit(400)
      .then((r) => r.data ?? []),
  ]);

  // Interactions over time: page views + reads + hearts + requests per day
  const dayStart = Date.now() - (SERIES_DAYS - 1) * 24 * 3600 * 1000;
  const byDay = new Map<string, number>();
  for (let i = 0; i < SERIES_DAYS; i++) byDay.set(isoDay(dayStart + i * 24 * 3600 * 1000), 0);
  const bump = (ts: string) => {
    const day = String(ts).slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  };
  for (const v of views) bump(v.ts);
  for (const r of reads) bump(r.created_at);
  for (const f of favorites) bump(f.created_at);
  for (const r of requests) bump(r.created_at);

  return NextResponse.json({
    profile,
    reads,
    favorites,
    requests,
    notes,
    activity: views.slice(0, 60),
    series: [...byDay.entries()].map(([day, count]) => ({ day, count })),
    activityPending: views.length === 0, // pre-0013 there are no email-tagged views yet
  });
});
