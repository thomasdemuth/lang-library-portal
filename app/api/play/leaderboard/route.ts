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
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length === 0) return NextResponse.json({ leaders: [] });

  const { data: profiles } = await db()
    .from("student_profiles")
    .select("email, avatar")
    .in("email", top.map(([email]) => email));
  const avatars = new Map((profiles ?? []).map((p) => [p.email, p.avatar as Avatar]));

  return NextResponse.json({
    leaders: top.map(([email, books], i) => ({
      rank: i + 1,
      name: displayName(email),
      books,
      avatar: avatars.get(email) ?? DEFAULT_AVATAR,
    })),
  });
});
