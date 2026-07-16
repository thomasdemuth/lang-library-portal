import { db } from "@/lib/db";

export const MAX_COLLECTIONS = 12;
export const MAX_BOOKS_PER_COLLECTION = 60;

export function collectionsMissingTable(message: string | undefined): boolean {
  return /collections|collection_books|relation|does not exist|schema cache/i.test(message ?? "");
}

export type CollectionBook = { book_key: string; title: string; isbn13: string | null };
export type Collection = { id: number; name: string; books: CollectionBook[] };

/** Load someone's collections with their books (shared by /me and public pages). */
export async function loadCollections(email: string): Promise<Collection[] | "missing-table" | null> {
  const { data: cols, error } = await db()
    .from("collections")
    .select("id, name")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(MAX_COLLECTIONS);
  if (error) return collectionsMissingTable(error.message) ? "missing-table" : null;
  if (!cols || cols.length === 0) return [];

  const { data: books, error: bErr } = await db()
    .from("collection_books")
    .select("collection_id, book_key, title, isbn13")
    .in("collection_id", cols.map((c) => c.id))
    .order("created_at", { ascending: true });
  if (bErr) return null;

  const byCol = new Map<number, CollectionBook[]>();
  for (const b of books ?? []) {
    const list = byCol.get(b.collection_id) ?? [];
    list.push({ book_key: b.book_key, title: b.title, isbn13: b.isbn13 });
    byCol.set(b.collection_id, list);
  }
  return cols.map((c) => ({ id: c.id, name: c.name, books: byCol.get(c.id) ?? [] }));
}
