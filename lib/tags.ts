import { db } from "@/lib/db";
import { CATEGORIES, type CategoryId } from "@/lib/categories";

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && v in CATEGORIES;
}

/**
 * Join category tags onto book rows by dedupe_key. Tags live in book_tags
 * (keyed by the content-derived dedupe_key) so they survive Libib
 * re-imports. Degrades to tag:null everywhere if migration 0007 hasn't run.
 */
export async function attachTags<T extends { dedupe_key: string }>(
  books: T[]
): Promise<(T & { tag: CategoryId | null })[]> {
  if (books.length === 0) return [];
  const keys = [...new Set(books.map((b) => b.dedupe_key))];
  let tags = new Map<string, CategoryId>();
  try {
    const { data, error } = await db()
      .from("book_tags")
      .select("book_key, category")
      .in("book_key", keys);
    if (!error && data) {
      tags = new Map(data.map((t) => [t.book_key as string, t.category as CategoryId]));
    }
  } catch {
    /* book_tags table missing (pre-0007) — books simply carry no tag */
  }
  return books.map((b) => ({ ...b, tag: tags.get(b.dedupe_key) ?? null }));
}
