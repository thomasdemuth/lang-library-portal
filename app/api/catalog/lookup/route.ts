import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { getActiveSyncId } from "@/lib/active-sync";
import { isbnCandidates } from "@/lib/isbn";

/**
 * Barcode → the library's own book, for circulation (student self-checkout
 * scans and the staff desk). Inventory only — no external metadata lookup,
 * no admin fields; the admin scan tab keeps its richer route.
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  if (session.aud === "guest") return NextResponse.json({ error: "Not signed in" }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("code") ?? "";
  const digits = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length !== 10 && digits.length !== 12 && digits.length !== 13) {
    return NextResponse.json({ error: "That doesn't look like an ISBN barcode." }, { status: 400 });
  }
  const activeId = await getActiveSyncId();
  if (!activeId) return NextResponse.json({ found: false, code: digits });

  // Candidates are [0-9X] only, so they're safe to embed in the filter.
  const filter = isbnCandidates(digits)
    .flatMap((c) => [`isbn13.eq.${c}`, `isbn10.eq.${c}`])
    .join(",");
  const { data, error } = await db()
    .from("books")
    .select("id, title, creators, isbn13, copies, dedupe_key")
    .eq("sync_id", activeId)
    .or(filter)
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json(data ? { found: true, book: data, code: digits } : { found: false, code: digits });
});
