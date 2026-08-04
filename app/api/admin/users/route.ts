import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/hosts";

type Row = {
  email: string;
  lastSeen: string | null;
  notes: number;
  // students
  points?: number;
  booksRead?: number;
  favorites?: number;
  hidden?: boolean;
  publicId?: string | null;
  // teachers
  requests?: number;
  lastRequest?: string | null;
};

/** How many teacher accounts the roster may list. */
const ROSTER_LIMIT = 4000;

type DbErr = { code?: string; message?: string };
const rpcMissing = (e: DbErr) =>
  e.code === "PGRST202" ||
  /could not find the function|schema cache|does not exist|admin_user_stats|staff_roster/i.test(e.message ?? "");

/** Count rows per email from a single-column fetch (missing table → empty). */
async function countBy(table: string, column: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data } = await db().from(table).select(column).limit(5000);
  for (const r of (data ?? []) as unknown as Record<string, string>[]) {
    const key = r[column];
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Most recent page-view per signed-in email (pre-0013 → empty map). */
async function lastSeenByEmail(): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const { data } = await db()
    .from("usage_events")
    .select("email, ts")
    .not("email", "is", null)
    .order("ts", { ascending: false })
    .limit(4000);
  for (const r of data ?? []) {
    if (r.email && !seen.has(r.email)) seen.set(r.email, r.ts);
  }
  return seen;
}

type Stats = {
  seen: Map<string, string>;
  notes: Map<string, number>;
  reads: Map<string, number>;
  favs: Map<string, number>;
};
const emptyStats = (): Stats => ({ seen: new Map(), notes: new Map(), reads: new Map(), favs: new Map() });

/**
 * Per-account activity in one grouped pass — admin_user_stats() (migration
 * 0019) returns one row per account instead of the ~20k raw rows the scans
 * below used to ship. `withPlay` only matters for the pre-0019 fallback, where
 * the reading_log / favorites scans are worth skipping on the teachers tab.
 * A missing function falls back; any other error yields empty maps, exactly
 * as a failed scan did (everything reads as 0 / "never seen").
 */
async function userStats(withPlay: boolean): Promise<Stats> {
  const { data, error } = await db().rpc("admin_user_stats");
  if (!error) {
    const stats = emptyStats();
    type StatRow = { email: string; reads: number | string; favs: number | string; notes: number | string; last_seen: string | null };
    for (const r of (data ?? []) as StatRow[]) {
      if (!r.email) continue;
      if (r.last_seen) stats.seen.set(r.email, r.last_seen);
      stats.notes.set(r.email, Number(r.notes ?? 0));
      stats.reads.set(r.email, Number(r.reads ?? 0));
      stats.favs.set(r.email, Number(r.favs ?? 0));
    }
    return stats;
  }
  if (!rpcMissing(error)) return emptyStats();

  const [seen, notes, reads, favs] = await Promise.all([
    lastSeenByEmail(),
    countBy("account_notes", "email"),
    withPlay ? countBy("reading_log", "email") : Promise.resolve(new Map<string, number>()),
    withPlay ? countBy("favorites", "email") : Promise.resolve(new Map<string, number>()),
  ]);
  return { seen, notes, reads, favs };
}

type RosterRow = { email: string; requests: number; lastRequest: string | null };

/**
 * The teacher roster: everyone seen on the staff site, plus everyone who filed
 * a book request, with their request tally. staff_roster() (migration 0019)
 * groups it in the database, newest activity first — the pre-0019 fallback
 * below unions a 3,000-row request fetch with an UNORDERED 4,000-row view
 * fetch, which made the cut-off non-deterministic once either cap was hit.
 */
async function teacherRoster(): Promise<RosterRow[]> {
  const { data, error } = await db().rpc("staff_roster", { p_limit: ROSTER_LIMIT });
  if (!error) {
    type Row = { email: string; requests: number | string; last_request: string | null };
    return ((data ?? []) as Row[])
      .filter((r) => Boolean(r.email))
      .map((r) => ({ email: r.email, requests: Number(r.requests ?? 0), lastRequest: r.last_request ?? null }));
  }
  if (!rpcMissing(error)) return [];

  const { data: reqRows } = await db()
    .from("book_requests")
    .select("requester_email, created_at")
    .order("created_at", { ascending: false })
    .limit(3000);
  const requestCount = new Map<string, number>();
  const lastRequest = new Map<string, string>();
  for (const r of reqRows ?? []) {
    if (!r.requester_email) continue;
    requestCount.set(r.requester_email, (requestCount.get(r.requester_email) ?? 0) + 1);
    if (!lastRequest.has(r.requester_email)) lastRequest.set(r.requester_email, r.created_at);
  }

  const { data: staffViews } = await db()
    .from("usage_events")
    .select("email")
    .eq("role", "staff")
    .not("email", "is", null)
    .limit(4000);
  const emails = new Set<string>([...requestCount.keys()]);
  for (const v of staffViews ?? []) if (v.email) emails.add(v.email);

  return [...emails].map((email) => ({
    email,
    requests: requestCount.get(email) ?? 0,
    lastRequest: lastRequest.get(email) ?? null,
  }));
}

/**
 * User Insights: the account lists. Students come from their game profiles
 * (created on first visit); teachers from staff page views + book requests.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "users");
  const tab = req.nextUrl.searchParams.get("tab") === "teachers" ? "teachers" : "students";

  const { seen, notes, reads, favs } = await userStats(tab === "students");

  if (tab === "students") {
    type ProfRow = { email: string; points: number; public_id?: string; hidden?: boolean; created_at: string };
    let { data: profiles, error } = (await db()
      .from("student_profiles")
      .select("email, points, public_id, hidden, created_at")
      .limit(2000)) as { data: ProfRow[] | null; error: { message?: string } | null };
    if (error && /public_id|hidden/i.test(error.message ?? "")) {
      ({ data: profiles, error } = (await db()
        .from("student_profiles")
        .select("email, points, created_at")
        .limit(2000)) as { data: ProfRow[] | null; error: { message?: string } | null });
    }
    if (error) {
      if (/student_profiles|relation|does not exist/i.test(error.message ?? "")) {
        return NextResponse.json({ users: [], migrationPending: true });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    // Staff browsing the student site get profile rows too — not students
    const students = (profiles ?? []).filter((p) => p.email.endsWith(`@${STUDENT_EMAIL_DOMAIN}`));
    const users: Row[] = students.map((p) => ({
      email: p.email,
      lastSeen: seen.get(p.email) ?? null,
      notes: notes.get(p.email) ?? 0,
      points: p.points ?? 0,
      booksRead: reads.get(p.email) ?? 0,
      favorites: favs.get(p.email) ?? 0,
      hidden: Boolean((p as { hidden?: boolean }).hidden),
      publicId: (p as { public_id?: string }).public_id ?? null,
    }));
    users.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
    return NextResponse.json({ users });
  }

  // Teachers: anyone seen on the staff site as a gate visitor, plus requesters
  const roster = await teacherRoster();
  const users: Row[] = roster.map((t) => ({
    email: t.email,
    lastSeen: seen.get(t.email) ?? null,
    notes: notes.get(t.email) ?? 0,
    requests: t.requests,
    lastRequest: t.lastRequest,
  }));
  users.sort(
    (a, b) => (b.lastSeen ?? b.lastRequest ?? "").localeCompare(a.lastSeen ?? a.lastRequest ?? "")
  );
  return NextResponse.json({ users, activityPending: seen.size === 0 });
});
