"use client";

/**
 * One shared collections cache for every book card on the page — the
 * "Add to list" buttons all ask "which of my lists is this book in?" so
 * we fetch the lists once and keep them in sync as books are added.
 */

export type ClientCollection = { id: number; name: string; bookKeys: string[] };
export type CollectBook = { book_key: string; title: string; isbn13?: string | null };

let cache: ClientCollection[] | null = null;
let inflight: Promise<ClientCollection[]> | null = null;
let migrationPending = false;
const listeners = new Set<() => void>();

export function onCollectionsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export function collectionsMigrationPending(): boolean {
  return migrationPending;
}

type ApiCollection = { id: number; name: string; books: { book_key: string }[] };

export async function getCollections(): Promise<ClientCollection[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/play/collections")
      .then((r) => r.json())
      .then((d) => {
        migrationPending = Boolean(d.migrationPending);
        cache = ((d.collections ?? []) as ApiCollection[]).map((c) => ({
          id: c.id,
          name: c.name,
          bookKeys: c.books.map((b) => b.book_key),
        }));
        return cache;
      })
      .catch(() => {
        inflight = null; // allow a retry later
        return [];
      });
  }
  return inflight;
}

/** Create a new list and (optionally) drop a book straight into it. */
export async function createCollection(
  name: string,
  book?: CollectBook
): Promise<{ collection: ClientCollection } | { error: string }> {
  const res = await fetch("/api/play/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Couldn't create that list." };
  const created: ClientCollection = { id: data.collection.id, name: data.collection.name, bookKeys: [] };
  cache = [...(cache ?? []), created];
  notify();
  if (book) {
    const added = await addToCollection(created.id, book);
    if ("error" in added) return added;
  }
  return { collection: created };
}

/** Add a book to a list (no-op if it's already there). */
export async function addToCollection(id: number, book: CollectBook): Promise<{ ok: true } | { error: string }> {
  const res = await fetch("/api/play/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add", id, book }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Couldn't add that book." };
  const col = (cache ?? []).find((c) => c.id === id);
  if (col && !col.bookKeys.includes(book.book_key)) {
    col.bookKeys = [...col.bookKeys, book.book_key];
    notify();
  }
  return { ok: true };
}

/** Remove a book from a list. */
export async function removeFromCollection(id: number, book_key: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch("/api/play/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", id, book_key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Couldn't remove that book." };
  const col = (cache ?? []).find((c) => c.id === id);
  if (col) {
    col.bookKeys = col.bookKeys.filter((k) => k !== book_key);
    notify();
  }
  return { ok: true };
}

/** How many of my lists a given book lives in (for the button's badge). */
export function collectionCountFor(book_key: string): number {
  if (!cache) return 0;
  return cache.reduce((n, c) => n + (c.bookKeys.includes(book_key) ? 1 : 0), 0);
}
