/**
 * Whether an Open Library *title search* result may be believed. Pure and
 * dependency-free (lib/match is pure too) so the rule can be unit-tested
 * without the database — lib/enrich does the fetching and the writing.
 */
import { nameTokens, normalizeTitle, similarity, stripSubtitle } from "./match";

/** The Open Library search fields we judge a hit on. */
export type OlDoc = { title?: string | null; author_name?: string[] | null; isbn?: string[] | null; key?: string | null };

/**
 * How close the titles must be before a title-search result is believed at
 * all. Trigram Dice over normalized titles: 1.0 is identical, and 0.85 still
 * allows small wording differences while rejecting neighbours — "The Giver"
 * against "The River" scores 0.5.
 */
export const OL_TITLE_MIN = 0.85;
/**
 * The bar when nothing but the title can be checked — either the catalog row
 * has no author, or the search hit lists none. The library owns sixteen books
 * called "Life"; at that point a match is a coin toss, so only a near-verbatim
 * whole title earns even a description.
 */
export const OL_TITLE_ONLY_MIN = 0.95;

/** Do the two author strings share a real name token ("kinney", "dicamillo")? */
function authorsAgree(creators: string, authorNames: string[]): boolean {
  const want = nameTokens(creators);
  if (want.size === 0) return false;
  const got = nameTokens(authorNames.join(" "));
  for (const t of want) if (got.has(t)) return true;
  return false;
}

/** "(Readers Circle)", "[Large Print]" — edition noise around the same book. */
const EDITION_NOISE = /[([{][^)\]}]*[)\]}]/g;

/** Same title, edition parentheticals dropped. Still the same book. */
function editionForm(raw: string): string {
  return normalizeTitle(raw.replace(EDITION_NOISE, " "));
}

/** …and the subtitle dropped too. NOT necessarily the same book: "Wimpy Kid:
 *  Rodrick Rules" bares down to "Wimpy Kid", a different volume of a series. */
function bareForm(raw: string): string {
  return normalizeTitle(stripSubtitle(raw.replace(EDITION_NOISE, " ")));
}

/**
 * What a title-search hit may be used for. This runs unattended every night
 * against the live catalog, so the two writes are judged separately:
 *
 *  - `isbn` is an identity claim. It re-points the cover proxy and the barcode
 *    lookup at a different book, and nobody reviews it — so it needs both a
 *    title that lines up and an author that agrees. A book with no author on
 *    file can never earn one from a title search, however good the title looks.
 *  - `description` is a blurb: wrong-but-plausible is recoverable and changes
 *    no identity. Same author agreement, but the title may be matched more
 *    loosely; without a checkable author it takes the near-verbatim bar.
 */
export function acceptOlMatch(
  book: { title: string; creators: string | null },
  doc: OlDoc | null | undefined
): { isbn: boolean; description: boolean } {
  const no = { isbn: false, description: false };
  if (!doc?.title || !book.title) return no;

  // Three readings of "how alike are these titles", loosest last.
  const simFull = similarity(normalizeTitle(book.title), normalizeTitle(doc.title));
  const simEdition = Math.max(simFull, similarity(editionForm(book.title), editionForm(doc.title)));
  const simBare = Math.max(simEdition, similarity(bareForm(book.title), bareForm(doc.title)));
  if (simBare < OL_TITLE_MIN) return no; // not the same book under any reading

  const authorNames = (doc.author_name ?? []).filter(Boolean);
  if (book.creators && authorNames.length > 0) {
    // Authorship is checkable, so it decides. A disagreement is evidence
    // AGAINST the hit — the library's "Holes" is Sachar's, not Dekker's — and
    // it takes the description down with it.
    if (!authorsAgree(book.creators, authorNames)) return no;
    // The ISBN still needs the title itself to line up: a series volume shares
    // both its author and its base title with all of its siblings.
    return { isbn: simEdition >= OL_TITLE_MIN, description: true };
  }

  // Authorship unverifiable (no author on file, or none listed on the hit):
  // never an ISBN, and a description only on a near-verbatim whole title.
  return { isbn: false, description: simFull >= OL_TITLE_ONLY_MIN };
}
