import type { CategoryId, MapCategoryId } from "@/lib/categories";

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
  /** May be a book category or the map-only "games" area. */
  category: MapCategoryId;
  letter_range: string | null;
  shelf_number: string | null;
};

/**
 * The first author's surname, exactly as written: "Kinney, Jeff" → "Kinney";
 * "Scott O'Dell" → "O'Dell"; "Muñoz Ryan, Pam" → "Muñoz Ryan". Punctuation and
 * accents are left in place — callers that need a normalized form run it
 * through whichever normalizer their comparison target uses (surnameKey for
 * the map's letter ranges, lib/match's normalizeCreators for creators_norm).
 */
export function surnameOf(creators: string | null): string | null {
  if (!creators) return null;
  const first = creators.split(/[;/]|,(?=\s*[A-Z][^,]*,)/)[0].trim(); // first author chunk
  if (!first) return null;
  if (first.includes(",")) return first.split(",")[0].trim() || null; // "Last, First"
  const tokens = first.split(/\s+/).filter((t) => !/^(jr|sr|iii?|iv)\.?$/i.test(t));
  return (tokens[tokens.length - 1] ?? first).trim() || null; // "First Last"
}

/** "Kinney, Jeff" → "KINNEY"; "Jeff Kinney" → "KINNEY"; multiple authors use the first. */
export function surnameKey(creators: string | null): string | null {
  const name = surnameOf(creators);
  if (!name) return null;
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

/** Letter endpoints are short prefixes ("A", "AA", "Mz"); numeric ones are digits. */
const LETTER_ENDPOINT = /^[A-Z]{1,3}$/;
const NUMBER_ENDPOINT = /^[0-9]+$/;

/**
 * Parse "AA–CZ" / "A-Z" / "000–999" into [lo, hi]; null when there's no usable
 * range.
 *
 * Both halves have to LOOK like range endpoints — a short letter prefix, or
 * digits on both sides. Without that test any hyphenated name reads as a span:
 * "Easy-Readers" parsed as EASY→READERS, a bucket that swallows most of the
 * alphabet (KINNEY sits inside it), so a shelf whose label merely contains a
 * hyphen claimed books it has nothing to do with.
 */
export function parseRange(raw: string | null): [string, string] | null {
  if (!raw) return null;
  const parts = raw
    .toUpperCase()
    .split(/[–—-]/)
    .map((s) => s.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [lo, hi] = parts;
  const letters = LETTER_ENDPOINT.test(lo) && LETTER_ENDPOINT.test(hi);
  const numbers = NUMBER_ENDPOINT.test(lo) && NUMBER_ENDPOINT.test(hi);
  if (!letters && !numbers) return null;
  return [lo, hi];
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
  tag: MapCategoryId,
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
