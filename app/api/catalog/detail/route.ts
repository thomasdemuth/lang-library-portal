import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { getActiveSyncId } from "@/lib/active-sync";
import { hidesTeacherBooks } from "@/lib/tags";

// Per-browser only (the response is identical for everyone, but the route is
// behind a session, so no shared cache should hold it).
const CACHE = { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" };

/**
 * One book's public detail: cover ISBNs + description, for an expanded
 * card. Never returns internal notes (those are admin-only). Degrades
 * gracefully if the description column isn't there yet (pre-0010).
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });

  const activeId = await getActiveSyncId();
  if (!activeId) return NextResponse.json({ book: null }, { headers: CACHE });

  // Search and the home rows already keep teacher books away from students,
  // but the key travels in the URL — an old link or a shared one would open
  // the card. Checked directly against book_tags rather than through the
  // catalog, since this route never loads the book row itself.
  if (hidesTeacherBooks(session.aud)) {
    const flag = await db().from("book_tags").select("teachers").eq("book_key", key).maybeSingle();
    // Pre-0026 the column doesn't exist — and no book can be flagged yet.
    if (!flag.error && (flag.data as { teachers?: boolean } | null)?.teachers) {
      return NextResponse.json({ book: null }, { headers: CACHE });
    }
  }

  const withDesc = await db()
    .from("books")
    .select("isbn13, isbn10, description")
    .eq("sync_id", activeId)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (withDesc.error && /description|column|does not exist/i.test(withDesc.error.message ?? "")) {
    const bare = await db()
      .from("books")
      .select("isbn13, isbn10")
      .eq("sync_id", activeId)
      .eq("dedupe_key", key)
      .maybeSingle();
    if (bare.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json(
      { book: bare.data ? { ...bare.data, description: null } : null },
      { headers: CACHE }
    );
  }
  if (withDesc.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ book: withDesc.data }, { headers: CACHE });
});
