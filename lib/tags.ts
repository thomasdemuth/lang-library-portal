import { db } from "./db";
import { CATEGORIES, type CategoryId } from "./categories";
import type { Audience } from "./session";

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && v in CATEGORIES;
}

/** What a book carries: an optional shelf category, plus the Teachers flag. */
export type BookTags = { tag: CategoryId | null; teachers: boolean };

/**
 * Who may see books marked for teachers.
 *
 * Students and guests may not — that is the whole point of the flag. Teachers
 * and management may. Called wherever the catalog is read, so the rule lives
 * in one place rather than being re-derived per route.
 */
export function hidesTeacherBooks(aud: Audience | undefined): boolean {
  // Fails closed: only the two audiences that are explicitly allowed to see
  // these books do. An unknown or missing audience is treated as a student.
  return aud !== "staff" && aud !== "admin";
}

/**
 * Join tags onto book rows by dedupe_key. Tags live in book_tags (keyed by the
 * content-derived dedupe_key) so they survive Libib re-imports. Degrades to
 * "no tags" everywhere if migration 0007 hasn't run, and to "no teacher flag"
 * if 0026 hasn't — which is safe, because before 0026 no book can be marked.
 */
export async function attachTags<T extends { dedupe_key: string }>(
  books: T[]
): Promise<(T & BookTags)[]> {
  if (books.length === 0) return [];
  const keys = [...new Set(books.map((b) => b.dedupe_key))];
  let tags = new Map<string, BookTags>();
  try {
    type Row = { book_key: string; category: CategoryId | null; teachers?: boolean };
    const first = await db().from("book_tags").select("book_key, category, teachers").in("book_key", keys);
    // Pre-0026 the teachers column doesn't exist — read what does.
    const res =
      first.error && /teachers|column/i.test(first.error.message ?? "")
        ? await db().from("book_tags").select("book_key, category").in("book_key", keys)
        : first;
    if (!res.error && res.data) {
      tags = new Map(
        (res.data as unknown as Row[]).map((row) => [
          row.book_key,
          { tag: row.category ?? null, teachers: row.teachers === true },
        ])
      );
    }
  } catch {
    /* book_tags table missing (pre-0007) — books simply carry no tags */
  }
  return books.map((b) => ({ ...b, ...(tags.get(b.dedupe_key) ?? { tag: null, teachers: false }) }));
}
