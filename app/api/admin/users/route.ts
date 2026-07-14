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

/**
 * User Insights: the account lists. Students come from their game profiles
 * (created on first visit); teachers from staff page views + book requests.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "users");
  const tab = req.nextUrl.searchParams.get("tab") === "teachers" ? "teachers" : "students";

  const [seen, notes] = await Promise.all([lastSeenByEmail(), countBy("account_notes", "email")]);

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
    const [reads, favs] = await Promise.all([countBy("reading_log", "email"), countBy("favorites", "email")]);
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

  const users: Row[] = [...emails].map((email) => ({
    email,
    lastSeen: seen.get(email) ?? null,
    notes: notes.get(email) ?? 0,
    requests: requestCount.get(email) ?? 0,
    lastRequest: lastRequest.get(email) ?? null,
  }));
  users.sort(
    (a, b) => (b.lastSeen ?? b.lastRequest ?? "").localeCompare(a.lastSeen ?? a.lastRequest ?? "")
  );
  return NextResponse.json({ users, activityPending: seen.size === 0 });
});
