"use client";

/**
 * One shared favorites cache for every book card on the page — the rows
 * all ask "is this hearted?" so we fetch the list once and keep the set
 * in sync as the student taps hearts.
 */

export type FavBook = { book_key: string; title: string; isbn13?: string | null };

let favSet: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

export function onFavoritesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export async function getFavorites(): Promise<Set<string>> {
  if (favSet) return favSet;
  if (!inflight) {
    inflight = fetch("/api/play/favorites")
      .then((r) => r.json())
      .then((d) => {
        favSet = new Set<string>((d.favorites ?? []).map((f: FavBook) => f.book_key));
        return favSet;
      })
      .catch(() => {
        inflight = null; // allow a retry later
        return new Set<string>();
      });
  }
  return inflight;
}

/** Toggle a heart. Resolves to the new state, or an error message. */
export async function toggleFavorite(book: FavBook): Promise<{ favorited: boolean } | { error: string }> {
  const res = await fetch("/api/play/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Couldn't save that." };
  const set = await getFavorites();
  if (data.favorited) set.add(book.book_key);
  else set.delete(book.book_key);
  notify();
  return { favorited: data.favorited };
}

export function isFavorite(key: string): boolean {
  return favSet?.has(key) ?? false;
}
