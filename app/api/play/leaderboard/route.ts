import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { DEFAULT_AVATAR, displayName, type Avatar } from "@/lib/play";

/** Top readers (books logged), with their avatars. */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);

  const { data: logs, error } = await db().from("reading_log").select("email").limit(5000);
  if (error) {
    if (/reading_log|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ leaders: [], migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of logs ?? []) counts.set(row.email, (counts.get(row.email) ?? 0) + 1);
  // take extra, then drop hidden profiles and keep the top 10
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (top.length === 0) return NextResponse.json({ leaders: [] });

  // public_id / hidden arrive with migrations 0012/0013 — fall back gracefully
  type Prof = { email: string; avatar: Avatar; public_id?: string; hidden?: boolean };
  let profiles = (
    await db()
      .from("student_profiles")
      .select("email, avatar, public_id, hidden")
      .in("email", top.map(([email]) => email))
  ).data as Prof[] | null;
  if (!profiles) {
    profiles = (
      await db()
        .from("student_profiles")
        .select("email, avatar")
        .in("email", top.map(([email]) => email))
    ).data;
  }
  const byEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  return NextResponse.json({
    leaders: top
      .filter(([email]) => !byEmail.get(email)?.hidden)
      .slice(0, 10)
      .map(([email, books], i) => ({
        rank: i + 1,
        name: displayName(email),
        books,
        avatar: byEmail.get(email)?.avatar ?? DEFAULT_AVATAR,
        id: byEmail.get(email)?.public_id ?? null,
      })),
  });
});
