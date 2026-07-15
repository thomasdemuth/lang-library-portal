import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/**
 * One book's public detail: cover ISBNs + description, for an expanded
 * card. Never returns internal notes (those are admin-only). Degrades
 * gracefully if the description column isn't there yet (pre-0010).
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ book: null });

  const withDesc = await db()
    .from("books")
    .select("isbn13, isbn10, description")
    .eq("sync_id", active.id)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (withDesc.error && /description|column|does not exist/i.test(withDesc.error.message ?? "")) {
    const bare = await db()
      .from("books")
      .select("isbn13, isbn10")
      .eq("sync_id", active.id)
      .eq("dedupe_key", key)
      .maybeSingle();
    if (bare.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ book: bare.data ? { ...bare.data, description: null } : null });
  }
  if (withDesc.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ book: withDesc.data });
});
