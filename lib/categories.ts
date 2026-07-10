/** The library's category palette — mirrors the sign maker's CATS exactly. */
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
