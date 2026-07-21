import { normalizeText } from "./match";

/**
 * The games collection — a top-level inventory kept entirely separate from
 * books. Every game belongs to exactly one sub-category; "other" is the
 * default/fallback. The sub-categories drive the display rows (student/staff
 * portals) and the management filter, in the fixed order below.
 */
export const GAME_SUBCATEGORIES = {
  card: { label: "Card Games" },
  board: { label: "Board Games" },
  word: { label: "Word Games" },
  other: { label: "Other Games" },
} as const;

export type GameSubcategory = keyof typeof GAME_SUBCATEGORIES;

/** Display / row order: Card, Board, Word, Other. */
export const GAME_SUBCATEGORY_IDS = ["card", "board", "word", "other"] as GameSubcategory[];

export function isGameSubcategory(v: unknown): v is GameSubcategory {
  return typeof v === "string" && v in GAME_SUBCATEGORIES;
}

/** Coerce any value to a valid sub-category, defaulting to "other". */
export function toSubcategory(v: unknown): GameSubcategory {
  return isGameSubcategory(v) ? v : "other";
}

/** A game inventory item. Mirrors the book fields that make sense for games
 *  (title/description/cover/copies) plus games-specific ones. */
export type Game = {
  id: number;
  title: string;
  subcategory: GameSubcategory;
  description: string | null;
  image_url: string | null;
  copies: number;
  condition: string | null;
  location: string | null;
  available: boolean;
};

/** Search key for a game title — same normalization books use. */
export function normalizeGameTitle(title: string): string {
  return normalizeText(title);
}
