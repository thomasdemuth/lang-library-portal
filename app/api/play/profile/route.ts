import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

function migrationPending(message: string | undefined): boolean {
  return /student_profiles|reading_log|relation|does not exist/i.test(message ?? "");
}

type ProfileRow = {
  email: string;
  public_id?: string;
  hidden?: boolean;
  photo_url?: string | null;
};

async function loadProfile(email: string): Promise<ProfileRow | "missing-table" | null> {
  // public_id / hidden / photo_url arrive with migrations 0012/0013/0020 —
  // peel columns off the select until the schema matches.
  let { data, error } = await db()
    .from("student_profiles")
    .select("email, public_id, hidden, photo_url")
    .eq("email", email)
    .maybeSingle();
  if (error && /photo_url/i.test(error.message ?? "")) {
    ({ data, error } = await db()
      .from("student_profiles")
      .select("email, public_id, hidden")
      .eq("email", email)
      .maybeSingle());
  }
  if (error && /public_id|hidden/i.test(error.message ?? "")) {
    ({ data, error } = await db().from("student_profiles").select("email").eq("email", email).maybeSingle());
  }
  if (error) return migrationPending(error.message) ? "missing-table" : null;
  if (data) return data as ProfileRow;
  const fresh = { email };
  const { error: insErr } = await db().from("student_profiles").insert(fresh);
  if (insErr && !/duplicate/i.test(insErr.message ?? "")) {
    return migrationPending(insErr.message) ? "missing-table" : null;
  }
  return fresh;
}

// One reader's own data — private, and brief enough that a fresh read
// shows up in the counts straight away.
const CACHE = { "Cache-Control": "private, max-age=60, stale-while-revalidate=600" };

/** My profile basics (display identity, privacy flag) + reading counts. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const profile = await loadProfile(session.email);
  if (profile === "missing-table") {
    return NextResponse.json({ profile: null, migrationPending: true }, { headers: CACHE });
  }
  if (!profile) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  let booksRead = 0;
  let booksThisYear = 0;
  let booksThisMonth = 0;
  try {
    const base = () => db().from("reading_log").select("id", { count: "exact", head: true }).eq("email", session.email);
    const [all, year, month] = await Promise.all([
      base(),
      base().gte("created_at", yearStart),
      base().gte("created_at", monthStart),
    ]);
    booksRead = all.count ?? 0;
    booksThisYear = year.count ?? 0;
    booksThisMonth = month.count ?? 0;
  } catch {
    /* pre-migration */
  }
  return NextResponse.json({ profile, booksRead, booksThisYear, booksThisMonth }, { headers: CACHE });
});

const Body = z.object({ action: z.literal("privacy"), hidden: z.boolean() });

/** Toggle profile privacy (hidden profiles vanish from classmates' views). */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const profile = await loadProfile(session.email);
  if (profile === "missing-table") {
    return NextResponse.json({ error: "This needs a pending database migration (0011)." }, { status: 409 });
  }
  if (!profile) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const { error } = await db()
    .from("student_profiles")
    .update({ hidden: parsed.data.hidden })
    .eq("email", session.email);
  if (error) {
    if (/hidden|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "Profile privacy unlocks after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hidden: parsed.data.hidden });
});
