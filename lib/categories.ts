/** The library's BOOK category palette — mirrors the sign maker's CATS exactly.
 *  These are the tags books can carry; games are deliberately NOT in here so
 *  they can never appear in a book tag picker. */
export const CATEGORIES = {
  fiction: { label: "Fiction", color: "#B2222C" },
  comics: { label: "Comics", color: "#29AC9C" },
  nonfiction: { label: "Non-Fiction", color: "#2E3B8E" },
  young: { label: "Young Reader", color: "#E82D86" },
  drama: { label: "Drama", color: "#A67C00" },
  other: { label: "Other", color: "#000000" },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

/** Grass green — the one place the Games color is defined (map areas, legend,
 *  games accents). Never hardcode this hex elsewhere. */
export const GAMES_COLOR = "#4CAF50";

/** Map area types = the book categories PLUS a Games area. Games areas exist
 *  only on the map (a physical spot for the games collection); "games" is a
 *  map category, never a book tag, so books and games stay separate. */
export const MAP_CATEGORIES = {
  ...CATEGORIES,
  games: { label: "Games", color: GAMES_COLOR },
} as const;

export type MapCategoryId = keyof typeof MAP_CATEGORIES;
export const MAP_CATEGORY_IDS = Object.keys(MAP_CATEGORIES) as MapCategoryId[];
