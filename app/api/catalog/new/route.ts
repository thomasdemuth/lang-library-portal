import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { attachTags } from "@/lib/tags";

/**
 * "New on the shelves": the most recently added titles in the active
 * generation (row order tracks Libib additions plus scan-ins). Only
 * books with an ISBN qualify — the carousel needs cover art.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ books: [] });

  const { data, error } = await db()
    .from("books")
    .select("id, title, creators, isbn13, dedupe_key")
    .eq("sync_id", active.id)
    .not("isbn13", "is", null)
    .order("id", { ascending: false })
    .limit(14);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ books: await attachTags(data ?? []) });
});
