import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { DAILY_READ_LIMIT, POINTS_PER_READ } from "@/lib/play";

const Body = z.object({
  book_key: z.string().min(1).max(600),
  title: z.string().trim().min(1).max(500),
});

/** My reading log, newest first. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { data, error } = await db()
    .from("reading_log")
    .select("id, title, created_at")
    .eq("email", session.email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (/reading_log|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ log: [], migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ log: data ?? [] });
});

/**
 * "I read this!" — log a book once, earn stars. A small daily cap keeps
 * the leaderboard about reading, not tapping.
 */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: today, error: capErr } = await db()
    .from("reading_log")
    .select("id", { count: "exact", head: true })
    .eq("email", session.email)
    .gte("created_at", dayAgo);
  if (capErr) {
    if (/reading_log|relation|does not exist|schema cache/i.test(capErr.message ?? "")) {
      return NextResponse.json({ error: "The reading game unlocks after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if ((today ?? 0) >= DAILY_READ_LIMIT) {
    return NextResponse.json(
      { error: `That's ${DAILY_READ_LIMIT} books today — amazing! Log the next one tomorrow.` },
      { status: 429 }
    );
  }

  const { error } = await db().from("reading_log").insert({
    email: session.email,
    book_key: parsed.data.book_key,
    title: parsed.data.title,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "You already logged this one 📖" }, { status: 409 });
    }
    if (/reading_log|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "The reading game unlocks after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Award stars (make sure a profile row exists first)
  await db()
    .from("student_profiles")
    .upsert({ email: session.email }, { onConflict: "email", ignoreDuplicates: true });
  const { data: prof } = await db()
    .from("student_profiles")
    .select("points")
    .eq("email", session.email)
    .single();
  const points = (prof?.points ?? 0) + POINTS_PER_READ;
  await db().from("student_profiles").update({ points }).eq("email", session.email);

  return NextResponse.json({ ok: true, earned: POINTS_PER_READ, points });
});
