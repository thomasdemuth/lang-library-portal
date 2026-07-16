import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { DEFAULT_AVATAR, displayName, type Avatar } from "@/lib/play";

const MAX_FRIENDS = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function missingTable(message: string | undefined): boolean {
  return /friends|relation|does not exist|schema cache/i.test(message ?? "");
}

/**
 * My friends list. Friends are stored by email but only ever surfaced by
 * public_id + display name, same as the leaderboard. Hidden profiles drop
 * off the list (they come back if the friend unhides).
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { data: rows, error } = await db()
    .from("friends")
    .select("friend_email, created_at")
    .eq("email", session.email)
    .order("created_at", { ascending: false })
    .limit(MAX_FRIENDS);
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ friends: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const emails = (rows ?? []).map((r) => r.friend_email);
  if (emails.length === 0) return NextResponse.json({ friends: [] });

  const [{ data: profiles }, { data: reads }] = await Promise.all([
    db().from("student_profiles").select("email, avatar, public_id, hidden").in("email", emails),
    db().from("reading_log").select("email").in("email", emails).limit(5000),
  ]);
  const readCounts = new Map<string, number>();
  for (const r of reads ?? []) readCounts.set(r.email, (readCounts.get(r.email) ?? 0) + 1);
  const byEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const friends = emails
    .map((email) => {
      const p = byEmail.get(email);
      if (!p || p.hidden || !p.public_id) return null; // hidden = private, skip
      return {
        id: p.public_id as string,
        name: displayName(email),
        avatar: { ...DEFAULT_AVATAR, ...(p.avatar as Avatar) },
        booksRead: readCounts.get(email) ?? 0,
      };
    })
    .filter(Boolean);
  return NextResponse.json({ friends });
});

const Body = z.object({
  id: z.string().regex(UUID_RE), // the friend's public_id — never an email
  action: z.enum(["add", "remove"]),
});

/** Add or remove a friend by their public page id. */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data: target, error: findErr } = await db()
    .from("student_profiles")
    .select("email, hidden")
    .eq("public_id", parsed.data.id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!target || (parsed.data.action === "add" && target.hidden)) {
    return NextResponse.json({ error: "We couldn't find that reader." }, { status: 404 });
  }
  if (target.email === session.email) {
    return NextResponse.json({ error: "You're already your own best friend!" }, { status: 400 });
  }

  if (parsed.data.action === "remove") {
    const { error } = await db()
      .from("friends")
      .delete()
      .eq("email", session.email)
      .eq("friend_email", target.email);
    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json({ error: "Friends unlock after the next library update!" }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, isFriend: false });
  }

  const { count, error: countErr } = await db()
    .from("friends")
    .select("id", { count: "exact", head: true })
    .eq("email", session.email);
  if (countErr) {
    if (missingTable(countErr.message)) {
      return NextResponse.json({ error: "Friends unlock after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_FRIENDS) {
    return NextResponse.json({ error: `That's ${MAX_FRIENDS} friends — quite the book club already!` }, { status: 400 });
  }

  const { error } = await db().from("friends").insert({ email: session.email, friend_email: target.email });
  if (error && !/duplicate|unique/i.test(error.message ?? "")) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, isFriend: true });
});
