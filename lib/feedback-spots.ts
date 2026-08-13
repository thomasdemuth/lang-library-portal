import { MAP_CATEGORIES, type MapCategoryId } from "./categories";
import type { Topic } from "./feedback";

/**
 * QR "spots" — the physical places a feedback poster can hang, and the short
 * codes their QR codes encode (`/hi/<code>`).
 *
 * Codes are DERIVED from the shelves already drawn in the Map Editor rather
 * than stored: a zone needs no extra column, no extra editing step, and no way
 * for the two to drift. The cost is that renaming a zone changes its code, so
 * posters printed under the old name no longer resolve to it — which is why
 * resolveSpot() never 404s. An unknown code still collects feedback about the
 * library, and the raw code is stored on the row either way, so a poster that
 * has fallen out of sync is visible in triage instead of silently dead.
 */

/** Mirrors --brand-blue in app/globals.css (the non-category spots' color). */
const BRAND_COLOR = "#2e50c8";

/** The two reserved codes, printable without any shelves defined. */
export const SITE_CODE = "site";
export const LIBRARY_CODE = "library";

/** The shelf fields a spot is built from — a subset of lib/shelve.ts ShelfInfo. */
export type SpotShelf = {
  label: string;
  category: string;
  shelf_number?: string | null;
  sort?: number | null;
};

export type Spot = {
  /** The code in the URL: /hi/<code> */
  code: string;
  topic: Topic;
  /** Human name of the place, e.g. "Fiction A–C" or "the new website". */
  label: string;
  /** The question the landing page leads with. */
  heading: string;
  color: string;
  category: MapCategoryId | null;
  /** False for the fallback spot an unrecognized code resolves to. */
  known: boolean;
};

/** Longest slug we generate — keeps the encoded URL short, so the QR stays coarse. */
const MAX_SLUG = 24;

/** "04 · Fiction A–C" → "04-fiction-a-c". Trims at a dash so words stay whole. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_SLUG) return slug;
  const cut = slug.slice(0, MAX_SLUG);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 8 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** A single shelf's code, before collision handling. */
export function spotSlug(shelf: SpotShelf): string {
  return slugify(`${shelf.shelf_number ?? ""} ${shelf.label}`) || "zone";
}

/** Normalize whatever arrived in the URL to the shape codes are generated in. */
export function normalizeCode(raw: string): string {
  return slugify(decodeURIComponent(raw ?? ""));
}

function categoryOf(shelf: SpotShelf): MapCategoryId | null {
  return shelf.category in MAP_CATEGORIES ? (shelf.category as MapCategoryId) : null;
}

const SITE_SPOT: Spot = {
  code: SITE_CODE,
  topic: "website",
  label: "the new website",
  heading: "How's the new library website?",
  color: BRAND_COLOR,
  category: null,
  known: true,
};

const LIBRARY_SPOT: Spot = {
  code: LIBRARY_CODE,
  topic: "library",
  label: "the library",
  heading: "How's the new library?",
  color: BRAND_COLOR,
  category: null,
  known: true,
};

/**
 * Every printable spot: the website, the library as a whole, then one per map
 * zone in map order. Codes are deduped with -2, -3 … over that stable order, so
 * two zones sharing a name keep the same codes from one print run to the next.
 */
export function listSpots(shelves: readonly SpotShelf[]): Spot[] {
  const ordered = [...shelves].sort(
    (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.label.localeCompare(b.label)
  );
  const used = new Set<string>([SITE_CODE, LIBRARY_CODE]);
  const spots: Spot[] = [SITE_SPOT, LIBRARY_SPOT];

  for (const shelf of ordered) {
    const base = spotSlug(shelf);
    let code = base;
    for (let n = 2; used.has(code); n++) code = `${base}-${n}`;
    used.add(code);

    const category = categoryOf(shelf);
    spots.push({
      code,
      topic: "library",
      label: shelf.label,
      heading: `How's the ${shelf.label} area?`,
      color: category ? MAP_CATEGORIES[category].color : BRAND_COLOR,
      category,
      known: true,
    });
  }
  return spots;
}

/**
 * Code → spot. Unknown codes (a zone renamed since its poster was printed, or
 * a mistyped URL) resolve to the library as a whole rather than failing: the
 * person is standing in the library holding a phone, and losing their feedback
 * over a stale slug would be the worst possible outcome.
 */
export function resolveSpot(rawCode: string, shelves: readonly SpotShelf[]): Spot {
  const code = normalizeCode(rawCode);
  if (!code) return LIBRARY_SPOT;
  const match = listSpots(shelves).find((spot) => spot.code === code);
  return match ?? { ...LIBRARY_SPOT, code, known: false };
}
