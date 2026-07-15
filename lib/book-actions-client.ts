"use client";

/**
 * Shared client actions for a book card — the reading log, the shelf
 * finder, and on-demand detail (description). Favorites live in
 * lib/favorites-client (they carry their own shared cache).
 */

export type ActionBook = { title: string; dedupe_key: string; isbn13: string | null };

/** "I read this" — log a book, earn stars. */
export async function logRead(
  b: ActionBook
): Promise<{ earned: number; points: number } | { error: string }> {
  const res = await fetch("/api/play/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_key: b.dedupe_key, title: b.title }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { earned: data.earned, points: data.points } : { error: data.error ?? "Couldn't log that one." };
}

export type ShelfResult = { shelfId: string } | { message: string };

/** Which shelf a book lives on — the shelf id to fly to, or a friendly note. */
export async function findShelf(b: ActionBook): Promise<ShelfResult> {
  try {
    const res = await fetch(`/api/catalog/where?key=${encodeURIComponent(b.dedupe_key)}`);
    const data = await res.json().catch(() => ({}));
    if (data.found && data.shelves?.length) return { shelfId: data.shelves[0].id };
  } catch {
    /* fall through to the friendly note */
  }
  return { message: `“${b.title}” doesn't have a shelf on the map yet — ask at the library desk.` };
}

export type BookDetail = { isbn13: string | null; isbn10: string | null; description: string | null };

/** Fetch a book's cover ISBNs + description on demand (for expanded cards). */
export async function fetchDetail(key: string): Promise<BookDetail | null> {
  try {
    const res = await fetch(`/api/catalog/detail?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.book ?? null;
  } catch {
    return null;
  }
}
