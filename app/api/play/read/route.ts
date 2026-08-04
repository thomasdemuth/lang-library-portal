import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

const Body = z.object({
  book_key: z.string().min(1).max(600),
  title: z.string().trim().min(1).max(500),
});

/** My reading log, newest first. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { data, error } = await db()
    .from("reading_log")
    .select("id, book_key, title, created_at")
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

/** "I read this" — add a book to my personal reading log (once per book). */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await db()
    .from("reading_log")
    .insert({
      email: session.email,
      book_key: parsed.data.book_key,
      title: parsed.data.title,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "You already logged this one" }, { status: 409 });
    }
    if (/reading_log|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "The reading log unlocks after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null, message: "Added to your reading log" });
});

/** Remove one of MY log rows (?id=…) — ownership enforced by session email. */
export const DELETE = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("reading_log")
    .delete()
    .eq("id", id)
    .eq("email", session.email)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That log entry is already gone." }, { status: 404 });
  return NextResponse.json({ ok: true });
});
