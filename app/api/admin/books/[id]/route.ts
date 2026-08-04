import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { attachTags } from "@/lib/tags";
import { authorSortKey } from "@/lib/shelve";
import { normalizeCreators } from "@/lib/match";

const nz = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const Body = z.union([
  z.object({ delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({
    fields: z.object({
      title: z.string().trim().min(1).max(500).optional(),
      creators: nz(500).optional(),
      isbn13: nz(20).optional(),
      isbn10: nz(20).optional(),
      description: nz(5000).optional(),
      notes: nz(2000).optional(),
      copies: z.number().int().min(1).max(999).optional(),
    }),
  }),
]);

const COLS = "id, title, creators, isbn13, isbn10, copies, group_name, dedupe_key";

/** Detail for the expanded catalog card: description + internal notes. */
export const GET = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_view");
    const { id } = await ctx.params;
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const { data, error } = await db()
      .from("books")
      .select("id, isbn13, isbn10, description, notes")
      .eq("id", bookId)
      .maybeSingle();
    if (error) {
      // Pre-0010 the columns don't exist yet — the card just has less to show.
      const { data: bare } = await db()
        .from("books")
        .select("id, isbn13, isbn10")
        .eq("id", bookId)
        .maybeSingle();
      if (!bare) return NextResponse.json({ error: "No such book" }, { status: 404 });
      return NextResponse.json({ book: { ...bare, description: null, notes: null } });
    }
    if (!data) return NextResponse.json({ error: "No such book" }, { status: 404 });
    return NextResponse.json({ book: data });
  }
);

/**
 * Adjust a book's copy count by ±1 (scan flow), or edit its properties
 * ({ fields }). Removing the last copy deletes the row. The dedupe_key is
 * left untouched on edits so the book keeps its tag (book_tags is keyed by
 * it). As with scans, the weekly Libib import is the source of truth and
 * will re-baseline every field.
 */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // ── Edit properties ──────────────────────────────────────────────
    if ("fields" in parsed.data) {
      const f = parsed.data.fields;
      const patch: Record<string, unknown> = {};
      if (f.title !== undefined) patch.title = f.title;
      if (f.creators !== undefined) {
        patch.creators = f.creators;
        patch.creators_norm = f.creators ? normalizeCreators(f.creators) || null : null;
        patch.author_sort = authorSortKey(f.creators);
      }
      if (f.isbn13 !== undefined) patch.isbn13 = f.isbn13;
      if (f.isbn10 !== undefined) patch.isbn10 = f.isbn10;
      if (f.description !== undefined) patch.description = f.description;
      if (f.notes !== undefined) patch.notes = f.notes;
      if (f.copies !== undefined) patch.copies = f.copies;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

      let { error } = await db().from("books").update(patch).eq("id", bookId);
      // description/notes (0010) or author_sort (0014) may not exist yet — drop and retry
      if (error && /column/i.test(error.message ?? "") && /(description|notes|author_sort)/.test(error.message ?? "")) {
        const { description: _d, notes: _n, author_sort: _a, ...bare } = patch;
        ({ error } = await db().from("books").update(bare).eq("id", bookId));
      }
      if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

      const { data: book } = await db().from("books").select(COLS).eq("id", bookId).maybeSingle();
      if (!book) return NextResponse.json({ error: "No such book" }, { status: 404 });
      return NextResponse.json({ ok: true, book: (await attachTags([book]))[0] });
    }

    // ── Copy count ±1 ────────────────────────────────────────────────
    // Optimistic lock, not a plain read-modify-write: two people stepping the
    // same book at once (or one person double-tapping) otherwise lose an
    // increment, and the delete-on-last-copy could fire against a count that
    // had already moved. Each attempt re-reads and only commits if the count
    // it decided from still holds.
    const { delta } = parsed.data;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: row, error: readErr } = await db()
        .from("books")
        .select("id, copies")
        .eq("id", bookId)
        .maybeSingle();
      if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
      if (!row) return NextResponse.json({ error: "No such book" }, { status: 404 });

      const next = row.copies + delta;
      if (next <= 0) {
        const { data: gone, error } = await db()
          .from("books")
          .delete()
          .eq("id", bookId)
          .eq("copies", row.copies)
          .select("id")
          .maybeSingle();
        if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
        if (gone) return NextResponse.json({ ok: true, removed: true, book: null });
        continue;
      }

      const { data: book, error } = await db()
        .from("books")
        .update({ copies: next })
        .eq("id", bookId)
        .eq("copies", row.copies)
        .select(COLS)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
      if (book) {
        return NextResponse.json({ ok: true, removed: false, book: (await attachTags([book]))[0] });
      }
    }
    return NextResponse.json(
      { error: "Someone else is changing this book's copies — try again." },
      { status: 409 }
    );
  }
);

/**
 * Delete a book from the active generation entirely. Like scans, the next
 * Libib import re-baselines the catalog, so this is a live-only removal.
 */
export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    const { error } = await db().from("books").delete().eq("id", bookId);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);
