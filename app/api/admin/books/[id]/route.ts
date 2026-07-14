import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { attachTags } from "@/lib/tags";

const Body = z.object({ delta: z.union([z.literal(1), z.literal(-1)]) });

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
 * Adjust a book's copy count by ±1 (scan flow). Removing the last copy
 * deletes the row from the active generation. As with adds, the weekly
 * Libib import is the source of truth and will re-baseline everything.
 */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { data: row, error: readErr } = await db()
      .from("books")
      .select("id, copies")
      .eq("id", bookId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!row) return NextResponse.json({ error: "No such book" }, { status: 404 });

    const next = row.copies + parsed.data.delta;
    if (next <= 0) {
      const { error } = await db().from("books").delete().eq("id", bookId);
      if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
      return NextResponse.json({ ok: true, removed: true, book: null });
    }

    const { error } = await db().from("books").update({ copies: next }).eq("id", bookId);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    const { data: book } = await db()
      .from("books")
      .select("id, title, creators, isbn13, isbn10, copies, group_name, dedupe_key")
      .eq("id", bookId)
      .single();
    return NextResponse.json({ ok: true, removed: false, book: book ? (await attachTags([book]))[0] : null });
  }
);
