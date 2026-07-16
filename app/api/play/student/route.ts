import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { DEFAULT_AVATAR, displayName, type Avatar } from "@/lib/play";
import { loadCollections } from "@/lib/collections";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Another student's public page, looked up by their non-guessable
 * public_id. Shares only what's meant to be shared: display name,
 * avatar, books-read count, favorites, and collections — never the email.
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let { data: profile, error } = await db()
    .from("student_profiles")
    .select("email, avatar, hidden")
    .eq("public_id", id)
    .maybeSingle();
  if (error && /hidden/i.test(error.message ?? "")) {
    ({ data: profile, error } = await db()
      .from("student_profiles")
      .select("email, avatar")
      .eq("public_id", id)
      .maybeSingle());
  }
  if (error) {
    if (/public_id|student_profiles|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  // Hidden profiles are private — indistinguishable from missing
  if (!profile || (profile as { hidden?: boolean }).hidden) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ count: booksRead }, { data: favorites }, collections, { data: friendRow }] = await Promise.all([
    db().from("reading_log").select("id", { count: "exact", head: true }).eq("email", profile.email),
    db()
      .from("favorites")
      .select("book_key, title, isbn13")
      .eq("email", profile.email)
      .order("created_at", { ascending: false })
      .limit(60),
    loadCollections(profile.email),
    // pre-0016 the friends table doesn't exist — the error just reads as "not a friend"
    db()
      .from("friends")
      .select("id")
      .eq("email", session.email)
      .eq("friend_email", profile.email)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    name: displayName(profile.email),
    avatar: { ...DEFAULT_AVATAR, ...(profile.avatar as Avatar) },
    booksRead: booksRead ?? 0,
    favorites: favorites ?? [],
    collections: Array.isArray(collections) ? collections.filter((c) => c.books.length > 0) : [],
    isFriend: Boolean(friendRow),
    isMe: profile.email === session.email,
  });
});
