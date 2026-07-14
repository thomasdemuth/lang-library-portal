import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { attachTags } from "@/lib/tags";
import { resolveShelf, type ShelfInfo } from "@/lib/shelve";

/**
 * Which shelf does this book live on? Resolves through the book's
 * category tag and the map's shelf ranges (see lib/shelve.ts).
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) return NextResponse.json({ found: false, reason: "no-inventory" });

  const { data: book } = await db()
    .from("books")
    .select("id, title, creators, dedupe_key")
    .eq("sync_id", active.id)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (!book) return NextResponse.json({ found: false, reason: "no-book" });

  const [tagged] = await attachTags([book]);
  if (!tagged.tag) return NextResponse.json({ found: false, reason: "untagged" });

  const { data: shelves, error } = await db()
    .from("shelves")
    .select("id, label, category, letter_range, shelf_number");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const match = resolveShelf(tagged.tag, book.creators, (shelves ?? []) as ShelfInfo[]);
  if (match.shelves.length === 0) return NextResponse.json({ found: false, reason: "no-shelf", tag: tagged.tag });

  return NextResponse.json({
    found: true,
    ranged: match.ranged,
    tag: tagged.tag,
    shelves: match.shelves.map((s) => ({
      id: s.id,
      label: s.label,
      shelf_number: s.shelf_number,
      letter_range: s.letter_range,
    })),
  });
});
