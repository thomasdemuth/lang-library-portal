import type { CategoryId } from "@/lib/categories";

/**
 * Book → shelf resolution. A shelf on the map carries the organization
 * scheme: its category color plus an optional range (letter ranges like
 * "AA–CZ" over author surnames for fiction-style sections; numeric spans
 * like "000–999" for call-number sections). A book resolves to the
 * shelves whose category matches its tag, narrowed by range if ranges
 * are present.
 */

export type ShelfInfo = {
  id: string;
  label: string;
  category: CategoryId;
  letter_range: string | null;
  shelf_number: string | null;
};

/** "Kinney, Jeff" → "KINNEY"; "Jeff Kinney" → "KINNEY"; multiple authors use the first. */
export function surnameKey(creators: string | null): string | null {
  if (!creators) return null;
  const first = creators.split(/[;/]|,(?=\s*[A-Z][^,]*,)/)[0].trim(); // first author chunk
  let name: string;
  if (first.includes(",")) {
    name = first.split(",")[0]; // "Last, First"
  } else {
    const tokens = first.split(/\s+/).filter((t) => !/^(jr|sr|iii?|iv)\.?$/i.test(t));
    name = tokens[tokens.length - 1] ?? first; // "First Last"
  }
  const key = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return key || null;
}

/**
 * A sortable "last name, first name" key for a book's author, e.g.
 * "Jeff Kinney" and "Kinney, Jeff" both → "kinney jeff kinney". Surname
 * first (from surnameKey), then the whole normalized name as a tiebreak.
 * Null when there's no author to sort on (those sort last).
 */
export function authorSortKey(creators: string | null): string | null {
  const surname = surnameKey(creators);
  if (!surname) return null;
  const rest = (creators ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
  return `${surname.toLowerCase()} ${rest}`.slice(0, 200);
}

/** Parse "AA–CZ" / "A-Z" / "000–999" into [lo, hi]; null when there's no usable range. */
export function parseRange(raw: string | null): [string, string] | null {
  if (!raw) return null;
  const parts = raw
    .toUpperCase()
    .split(/[–—-]/)
    .map((s) => s.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

/** Prefix-range test, library style: "KINNEY" is within [KA, LZ]. */
export function inRange(key: string, lo: string, hi: string): boolean {
  return key.slice(0, lo.length) >= lo && key.slice(0, hi.length) <= hi;
}

export type ShelfMatch = {
  /** The best shelf(s) for this book: 1 = confident, several = candidates. */
  shelves: ShelfInfo[];
  /** true when narrowed by a range match, not just the category color */
  ranged: boolean;
};

export function resolveShelf(
  tag: CategoryId,
  creators: string | null,
  shelves: ShelfInfo[]
): ShelfMatch {
  const inCategory = shelves.filter((s) => s.category === tag);
  const key = surnameKey(creators);
  if (key) {
    const ranged = inCategory.filter((s) => {
      // Some shelves carry the range in their LABEL ("A-E", "F-M"…)
      // rather than the letter-range field — accept either.
      const r = parseRange(s.letter_range) ?? parseRange(s.label);
      return r ? inRange(key, r[0], r[1]) : false;
    });
    if (ranged.length > 0) return { shelves: ranged, ranged: true };
  }
  return { shelves: inCategory, ranged: false };
}
