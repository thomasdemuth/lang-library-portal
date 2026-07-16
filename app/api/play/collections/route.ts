import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import {
  MAX_BOOKS_PER_COLLECTION,
  MAX_COLLECTIONS,
  collectionsMissingTable as missingTable,
  loadCollections,
} from "@/lib/collections";

/** My collections, oldest first (stable shelf order). */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const collections = await loadCollections(session.email);
  if (collections === "missing-table") return NextResponse.json({ collections: [], migrationPending: true });
  if (!collections) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ collections });
});

const Name = z.string().trim().min(1).max(40);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: Name }),
  z.object({ action: z.literal("rename"), id: z.number().int().positive(), name: Name }),
  z.object({ action: z.literal("delete"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("add"),
    id: z.number().int().positive(),
    book: z.object({
      book_key: z.string().min(1).max(600),
      title: z.string().trim().min(1).max(500),
      isbn13: z.string().max(20).nullish(),
    }),
  }),
  z.object({ action: z.literal("remove"), id: z.number().int().positive(), book_key: z.string().min(1).max(600) }),
]);

/** Create/rename/delete a collection, or add/remove a book in one. */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const input = parsed.data;

  if (input.action === "create") {
    const { count, error: countErr } = await db()
      .from("collections")
      .select("id", { count: "exact", head: true })
      .eq("email", session.email);
    if (countErr) {
      if (missingTable(countErr.message)) {
        return NextResponse.json({ error: "Collections unlock after the next library update!" }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_COLLECTIONS) {
      return NextResponse.json({ error: `That's ${MAX_COLLECTIONS} collections — the max for now!` }, { status: 400 });
    }
    const { data, error } = await db()
      .from("collections")
      .insert({ email: session.email, name: input.name })
      .select("id, name")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true, collection: { ...data, books: [] } });
  }

  // Every other action targets an existing collection — verify it's theirs.
  const { data: col, error: colErr } = await db()
    .from("collections")
    .select("id")
    .eq("id", input.id)
    .eq("email", session.email)
    .maybeSingle();
  if (colErr) {
    if (missingTable(colErr.message)) {
      return NextResponse.json({ error: "Collections unlock after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!col) return NextResponse.json({ error: "No such collection" }, { status: 404 });

  if (input.action === "rename") {
    const { error } = await db().from("collections").update({ name: input.name }).eq("id", input.id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "delete") {
    const { error } = await db().from("collections").delete().eq("id", input.id); // books cascade
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "remove") {
    const { error } = await db()
      .from("collection_books")
      .delete()
      .eq("collection_id", input.id)
      .eq("book_key", input.book_key);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // add
  const { count } = await db()
    .from("collection_books")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", input.id);
  if ((count ?? 0) >= MAX_BOOKS_PER_COLLECTION) {
    return NextResponse.json({ error: `That collection is full (${MAX_BOOKS_PER_COLLECTION} books).` }, { status: 400 });
  }
  const { error } = await db().from("collection_books").insert({
    collection_id: input.id,
    book_key: input.book.book_key,
    title: input.book.title,
    isbn13: input.book.isbn13 ?? null,
  });
  if (error && !/duplicate|unique/i.test(error.message ?? "")) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
});
