"use client";

/**
 * Shared client actions for a book card — the reading log, the shelf
 * finder, and on-demand detail (description). Favorites live in
 * lib/favorites-client (they carry their own shared cache).
 */
// MAP_CATEGORIES, not CATEGORIES: a book can resolve to the map-only Teachers
// area, and narrowing against the six book categories would drop that to "one
// of several shelves" when we know exactly which area it is.
import { MAP_CATEGORIES, type MapCategoryId } from "./categories";
import { withBase } from "./base";

export type ActionBook = { title: string; dedupe_key: string; isbn13: string | null };

/** How a toast/notice should look: green success, amber heads-up, red failure, blue info. */
export type NoteKind = "ok" | "warn" | "err" | "info";

export const OFFLINE_MESSAGE = "Can't reach the library right now — check the Wi-Fi and try again.";

/** A 401 means the session expired — send the visitor back to sign-in. */
export function sessionExpired(res: Response): boolean {
  if (res.status !== 401) return false;
  window.location.href = withBase("/");
  return true;
}

/** "I read this" — add a book to the personal reading log. */
export async function logRead(
  b: ActionBook
): Promise<{ id: number | null; message: string } | { error: string; kind: "warn" | "err" }> {
  try {
    const res = await fetch(withBase("/api/play/read"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key: b.dedupe_key, title: b.title }),
    });
    if (sessionExpired(res)) return { error: "Signed out — sign in again.", kind: "err" };
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { id: data.id ?? null, message: data.message ?? "Added to your reading log" };
    if (res.status === 409) return { error: data.error ?? "You already logged this one", kind: "warn" };
    return { error: data.error ?? "Couldn't log that one.", kind: "err" };
  } catch {
    return { error: OFFLINE_MESSAGE, kind: "err" };
  }
}

/** Remove one of my reading-log rows (the undo/removal half of logRead). */
export async function removeRead(id: number): Promise<{ ok: true } | { error: string; kind: "warn" | "err" }> {
  try {
    const res = await fetch(withBase(`/api/play/read?id=${id}`), { method: "DELETE" });
    if (sessionExpired(res)) return { error: "Signed out — sign in again.", kind: "err" };
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) return { error: data.error ?? "That log entry is already gone.", kind: "warn" };
    return { error: data.error ?? "Couldn't remove that one.", kind: "err" };
  } catch {
    return { error: OFFLINE_MESSAGE, kind: "err" };
  }
}

/**
 * A located book. `shelfId` is where the map should fly to; `message` is
 * non-null exactly when we are NOT sure which of `shelfIds` it is — the
 * lookup only matched the category, not a letter range, and more than one
 * shelf carries that category. Callers must show that sentence before
 * sending anyone to the map: naming one arbitrary shelf as "the" shelf is
 * how a student ends up staring at the wrong bay.
 */
export type ShelfHit = {
  shelfId: string;
  shelfIds: string[];
  area: MapCategoryId | null;
  certain: boolean;
  message: string | null;
};
export type ShelfResult = ShelfHit | { message: string; kind: "info" | "err" };

/** The honest one-liner for a book we've only narrowed to a category. */
export function shelfAreaMessage(area: MapCategoryId | null): string {
  if (!area) return "It's on one of several shelves — the map shows which ones.";
  const label = MAP_CATEGORIES[area].label;
  return `Somewhere in ${label} — check the ${label} shelves.`;
}

/** Which shelf a book lives on — where to fly to (and how sure we are), or a note. */
export async function findShelf(b: ActionBook): Promise<ShelfResult> {
  try {
    const res = await fetch(withBase(`/api/catalog/where?key=${encodeURIComponent(b.dedupe_key)}`));
    if (sessionExpired(res)) return { message: "Signed out — sign in again.", kind: "err" };
    if (!res.ok) return { message: OFFLINE_MESSAGE, kind: "err" };
    const data = await res.json().catch(() => ({}));
    if (data.found && data.shelves?.length) {
      const shelfIds = (data.shelves as { id: string }[]).map((s) => s.id);
      const area: MapCategoryId | null =
        data.tag && data.tag in MAP_CATEGORIES ? (data.tag as MapCategoryId) : null;
      // ranged === false means "this is just the category's shelves"; with
      // one shelf in the category that's still a definite answer.
      const certain = data.ranged === true || shelfIds.length === 1;
      return {
        shelfId: shelfIds[0],
        shelfIds,
        area,
        certain,
        message: certain ? null : shelfAreaMessage(area),
      };
    }
    return { message: `“${b.title}” doesn't have a shelf on the map yet.`, kind: "info" };
  } catch {
    return { message: OFFLINE_MESSAGE, kind: "err" };
  }
}

/**
 * The map deep-link for a hit. The map reads a single `?shelf=<id>` and
 * selects + zooms to it, so an uncertain hit can only point at the first
 * shelf of the right category — which is why the wording above has to carry
 * the uncertainty instead of the link.
 */
export function shelfMapHref(hit: ShelfHit): string {
  return withBase(`/map?shelf=${encodeURIComponent(hit.shelfId)}`);
}

export type BookDetail = { isbn13: string | null; isbn10: string | null; description: string | null };
export type DetailResult = { book: BookDetail | null } | { error: string };

/** Fetch a book's cover ISBNs + description on demand (for expanded cards). */
export async function fetchDetail(key: string): Promise<DetailResult> {
  try {
    const res = await fetch(withBase(`/api/catalog/detail?key=${encodeURIComponent(key)}`));
    if (sessionExpired(res)) return { error: "Signed out — sign in again." };
    if (!res.ok) return { error: "Couldn't load the description — check the Wi-Fi." };
    const data = await res.json();
    return { book: data.book ?? null };
  } catch {
    return { error: "Couldn't load the description — check the Wi-Fi." };
  }
}
