import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { DEFAULT_AVATAR, displayName, type Avatar } from "@/lib/play";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Another student's public page, looked up by their non-guessable
 * public_id. Shares only what's meant to be shared: display name,
 * avatar, books-read count, and favorites — never the email.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profile, error } = await db()
    .from("student_profiles")
    .select("email, avatar")
    .eq("public_id", id)
    .maybeSingle();
  if (error) {
    if (/public_id|student_profiles|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ count: booksRead }, { data: favorites }] = await Promise.all([
    db().from("reading_log").select("id", { count: "exact", head: true }).eq("email", profile.email),
    db()
      .from("favorites")
      .select("book_key, title, isbn13")
      .eq("email", profile.email)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  return NextResponse.json({
    name: displayName(profile.email),
    avatar: { ...DEFAULT_AVATAR, ...(profile.avatar as Avatar) },
    booksRead: booksRead ?? 0,
    favorites: favorites ?? [],
  });
});
