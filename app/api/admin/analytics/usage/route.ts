import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

/** Today's calendar date where the library lives (matches the SQL bucketing). */
function nyToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); // YYYY-MM-DD
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "analytics");
  const days = Math.min(90, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30));
  // Day bounds are America/New_York calendar dates — the usage_summary /
  // usage_top_paths functions bucket the same way, so "today" here is the
  // same day a 11:30pm ET page view lands on.
  const to = nyToday();
  const toMs = Date.parse(`${to}T00:00:00Z`); // date math on the calendar date itself
  const fromMs = toMs - (days - 1) * 24 * 3600 * 1000;

  const [summary, paths] = await Promise.all([
    db().rpc("usage_summary", { p_from: isoDay(fromMs), p_to: to }),
    db().rpc("usage_top_paths", { p_from: isoDay(fromMs), p_to: to, p_limit: 12 }),
  ]);
  if (summary.error || paths.error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  type Row = { day: string; audience: string; role: string; views: number; uniques: number };
  const rows = (summary.data ?? []) as Row[];

  // One entry per calendar day, split by site audience
  const byDay = new Map<string, { student: number; staff: number; uniques: number }>();
  for (let i = 0; i < days; i++) {
    byDay.set(isoDay(fromMs + i * 24 * 3600 * 1000), {
      student: 0,
      staff: 0,
      uniques: 0,
    });
  }
  for (const r of rows) {
    const day = byDay.get(String(r.day).slice(0, 10));
    if (!day) continue;
    if (r.audience === "student") day.student += Number(r.views);
    else day.staff += Number(r.views);
    day.uniques += Number(r.uniques); // approximate: summed across audience/role groups
  }

  const series = [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
  const last7 = series.slice(-7);
  return NextResponse.json({
    days,
    series,
    topPaths: paths.data ?? [],
    kpis: {
      views7: last7.reduce((n, d) => n + d.student + d.staff, 0),
      uniques7: last7.reduce((n, d) => n + d.uniques, 0),
    },
  });
});
