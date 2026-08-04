import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { rowToBook } from "@/lib/match";
import { attachTags } from "@/lib/tags";
import { normalizeIsbn } from "@/lib/isbn";

const MAX_COPIES = 999;

const Body = z.object({
  title: z.string().trim().min(1).max(500),
  creators: z.string().trim().max(500).nullable().optional(),
  isbn13: z.string().trim().max(20).nullable().optional(),
  isbn10: z.string().trim().max(20).nullable().optional(),
  publisher: z.string().trim().max(300).nullable().optional(),
  publish_date: z.string().trim().max(50).nullable().optional(),
  /** How many copies to add. Omitted = 1, which is what the scan flow wants. */
  copies: z.number().int().min(1).max(999).optional(),
});

/**
 * Add a book to the ACTIVE inventory generation (scan + manual add).
 * If the same book already exists there (dedupe_key match, checked against
 * BOTH ISBN forms), its copies go up by the same amount instead. Note: the
 * weekly Libib import replaces the whole generation, so additions should
 * also be entered in Libib to stick permanently — the scan UI says so.
 */
export const POST = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const copies = parsed.data.copies ?? 1;
  // Fill in whichever ISBN form is missing before the record (and its dedupe
  // key) is built, so a book added from its ISBN-10 lands on the same i13 key
  // as the same book scanned off its EAN-13 barcode.
  const given13 = (parsed.data.isbn13 ?? "").trim();
  const given10 = (parsed.data.isbn10 ?? "").trim();
  const forms = normalizeIsbn(given13) ?? normalizeIsbn(given10);
  const record = rowToBook({
    title: parsed.data.title,
    creators: parsed.data.creators ?? "",
    isbn13: given13 || forms?.isbn13 || "",
    isbn10: given10 || forms?.isbn10 || "",
    publisher: parsed.data.publisher ?? "",
    publish_date: parsed.data.publish_date ?? "",
    copies,
  });
  if (!record) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!active) {
    return NextResponse.json({ error: "No live inventory yet — import the Libib CSV first." }, { status: 409 });
  }

  // Both key spellings, exactly as lib/match.ts mints them: the ~48 rows that
  // carry only an ISBN-10 are filed under i10:, and this book's own key is
  // i13:, so checking one alone would insert a second row for the same book.
  const keys = new Set<string>([record.dedupe_key]);
  if (record.isbn13) keys.add(`i13:${record.isbn13}`);
  if (record.isbn10) keys.add(`i10:${record.isbn10}`);

  const { data: existing } = await db()
    .from("books")
    .select("id, copies")
    .eq("sync_id", active.id)
    .in("dedupe_key", [...keys])
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  let bookId: number;
  let clamped = false;
  if (existing) {
    bookId = existing.id;
    // Optimistic lock: write copies+N only if copies still holds, re-read and
    // retry when it moved under us. Two scanners on the same cart otherwise
    // lose one of the increments.
    let prev = existing.copies;
    let won = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = Math.min(MAX_COPIES, prev + copies);
      clamped = next < prev + copies;
      const { data: updated, error } = await db()
        .from("books")
        .update({ copies: next })
        .eq("id", existing.id)
        .eq("copies", prev)
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
      if (updated) {
        won = true;
        break;
      }
      const { data: again } = await db().from("books").select("copies").eq("id", existing.id).maybeSingle();
      if (!again) {
        return NextResponse.json({ error: "That book was removed while you were adding to it." }, { status: 409 });
      }
      prev = again.copies;
    }
    if (!won) {
      return NextResponse.json(
        { error: "Someone else is changing this book's copies — try again." },
        { status: 409 }
      );
    }
  } else {
    const { data: inserted, error } = await db()
      .from("books")
      .insert({ ...record, sync_id: active.id })
      .select("id")
      .single();
    if (error || !inserted) return NextResponse.json({ error: "Database error" }, { status: 500 });
    bookId = inserted.id;
  }

  const { data: book } = await db()
    .from("books")
    .select("id, title, creators, isbn13, isbn10, copies, group_name, dedupe_key")
    .eq("id", bookId)
    .single();
  return NextResponse.json({
    ok: true,
    added: !existing,
    clamped,
    // The clamp used to be silent, so the caller was told "added" for copies
    // that were never recorded. Say what actually happened instead.
    message: clamped
      ? `Already at the ${MAX_COPIES}-copy limit — the count didn't go up by ${copies}.`
      : existing
        ? `Copies now ${book?.copies ?? "?"}.`
        : "Added to the catalog.",
    book: book ? (await attachTags([book]))[0] : null,
  });
});
