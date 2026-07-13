import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { rowToBook } from "@/lib/match";
import { attachTags } from "@/lib/tags";

const Body = z.object({
  title: z.string().trim().min(1).max(500),
  creators: z.string().trim().max(500).nullable().optional(),
  isbn13: z.string().trim().max(20).nullable().optional(),
  isbn10: z.string().trim().max(20).nullable().optional(),
  publisher: z.string().trim().max(300).nullable().optional(),
  publish_date: z.string().trim().max(50).nullable().optional(),
});

/**
 * Add a single book to the ACTIVE inventory generation (scan flow).
 * If the same book already exists there (dedupe_key match), adds a copy
 * instead. Note: the weekly Libib import replaces the whole generation,
 * so additions should also be entered in Libib to stick permanently —
 * the scan UI says so.
 */
export const POST = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const record = rowToBook({
    title: parsed.data.title,
    creators: parsed.data.creators ?? "",
    isbn13: parsed.data.isbn13 ?? "",
    isbn10: parsed.data.isbn10 ?? "",
    publisher: parsed.data.publisher ?? "",
    publish_date: parsed.data.publish_date ?? "",
    copies: 1,
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

  const { data: existing } = await db()
    .from("books")
    .select("id, copies")
    .eq("sync_id", active.id)
    .eq("dedupe_key", record.dedupe_key)
    .maybeSingle();

  let bookId: number;
  if (existing) {
    const { error } = await db().from("books").update({ copies: existing.copies + 1 }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    bookId = existing.id;
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
    book: book ? (await attachTags([book]))[0] : null,
  });
});
