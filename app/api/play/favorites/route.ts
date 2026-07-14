import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

const MAX_FAVORITES = 100;

function missingTable(message: string | undefined): boolean {
  return /favorites|relation|does not exist|schema cache/i.test(message ?? "");
}

/** My favorites, newest first. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { data, error } = await db()
    .from("favorites")
    .select("book_key, title, isbn13, created_at")
    .eq("email", session.email)
    .order("created_at", { ascending: false })
    .limit(MAX_FAVORITES);
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ favorites: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ favorites: data ?? [] });
});

const Body = z.object({
  book_key: z.string().min(1).max(600),
  title: z.string().trim().min(1).max(500),
  isbn13: z.string().max(20).nullish(),
});

/** Toggle a favorite: ❤️ on if it's off, off if it's on. */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data: existing, error: readErr } = await db()
    .from("favorites")
    .select("id")
    .eq("email", session.email)
    .eq("book_key", parsed.data.book_key)
    .maybeSingle();
  if (readErr) {
    if (missingTable(readErr.message)) {
      return NextResponse.json({ error: "Favorites unlock after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (existing) {
    const { error } = await db().from("favorites").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true, favorited: false });
  }

  const { count } = await db()
    .from("favorites")
    .select("id", { count: "exact", head: true })
    .eq("email", session.email);
  if ((count ?? 0) >= MAX_FAVORITES) {
    return NextResponse.json({ error: `That's ${MAX_FAVORITES} favorites — un-heart one first!` }, { status: 400 });
  }

  const { error } = await db().from("favorites").insert({
    email: session.email,
    book_key: parsed.data.book_key,
    title: parsed.data.title,
    isbn13: parsed.data.isbn13 ?? null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, favorited: true }); // double-tap race
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, favorited: true });
});
