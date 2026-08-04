"use client";

import { OFFLINE_MESSAGE, sessionExpired } from "./book-actions-client";
import { withBase } from "./base";

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
    inflight = fetch(withBase("/api/play/favorites"))
      .then(async (r) => {
        if (!r.ok) throw new Error("favorites load failed");
        const d = await r.json();
        favSet = new Set<string>((d.favorites ?? []).map((f: FavBook) => f.book_key));
        return favSet;
      })
      .catch(() => {
        inflight = null; // failed load stays uncached — allow a retry later
        return new Set<string>();
      });
  }
  return inflight;
}

/** Toggle a heart. Resolves to the new state, or an error message. */
export async function toggleFavorite(
  book: FavBook
): Promise<{ favorited: boolean } | { error: string; kind: "warn" | "err" }> {
  let res: Response;
  try {
    res = await fetch(withBase("/api/play/favorites"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book),
    });
  } catch {
    return { error: OFFLINE_MESSAGE, kind: "err" };
  }
  if (sessionExpired(res)) return { error: "Signed out — sign in again.", kind: "err" };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error ?? "Couldn't save that.", kind: res.status === 409 ? "warn" : "err" };
  }
  const set = await getFavorites();
  if (data.favorited) set.add(book.book_key);
  else set.delete(book.book_key);
  notify();
  return { favorited: data.favorited };
}

export function isFavorite(key: string): boolean {
  return favSet?.has(key) ?? false;
}
