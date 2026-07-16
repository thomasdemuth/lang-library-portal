/**
 * Inventory normalization + request matching. Pure functions — used by the
 * CSV importer (browser + server) and the book-request matcher (server), and
 * unit-tested in isolation. Keep this dependency-free (lib/shelve is also
 * pure, so the author-sort key is safe to reuse here).
 */
import { authorSortKey } from "./shelve";

// ── Normalization ─────────────────────────────────────────────────────────

/** lowercase → strip diacritics → strip punctuation → collapse whitespace */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'‘]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title normalization also drops a leading article (the/a/an). */
export function normalizeTitle(s: string): string {
  return normalizeText(s).replace(/^(the|a|an) /, "");
}

/** "Harry Potter: Special Edition" → "Harry Potter" (works on RAW titles). */
export function stripSubtitle(raw: string): string {
  const cut = raw.split(/[:;]| - | – | — /)[0];
  return cut.trim() || raw;
}

export function normalizeCreators(s: string): string {
  return normalizeText(s);
}

/** Meaningful surname-ish tokens for author overlap checks. */
export function nameTokens(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter((t) => t.length >= 3));
}

// ── Similarity (Dice coefficient over character trigrams) ────────────────

function trigrams(s: string): Map<string, number> {
  const grams = new Map<string, number>();
  const padded = `  ${s} `;
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ga.values()) totalA += n;
  for (const n of gb.values()) totalB += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (totalA + totalB);
}

// ── Libib CSV rows → book records ─────────────────────────────────────────

export type BookRecord = {
  title: string;
  creators: string | null;
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  publish_date: string | null;
  description: string | null;
  notes: string | null;
  group_name: string | null;
  tags: string | null;
  item_type: string | null;
  copies: number;
  title_norm: string;
  creators_norm: string | null;
  author_sort: string | null;
  dedupe_key: string;
};

function digitsOnly(v: unknown): string | null {
  const d = String(v ?? "").replace(/[^0-9Xx]/g, "");
  return d.length >= 9 && d.length <= 20 ? d.toUpperCase() : null;
}

function text(v: unknown, maxLen: number): string | null {
  const s = String(v ?? "").trim().slice(0, maxLen);
  return s ? s : null;
}

/** Convert one parsed Libib CSV row (header-keyed object) or null to skip. */
export function rowToBook(row: Record<string, unknown>): BookRecord | null {
  const title = text(row.title, 500);
  if (!title) return null;
  const creators = text(row.creators, 500);
  const isbn13 = digitsOnly(row.ean_isbn13 ?? row.isbn13);
  const isbn10 = digitsOnly(row.upc_isbn10 ?? row.isbn10);
  const copiesRaw = row.copies ?? row.quantity ?? 1;
  const copies = Math.max(1, Math.min(999, parseInt(String(copiesRaw), 10) || 1));

  // Titles that are pure punctuation (the library owns a book titled "?")
  // normalize to nothing — fall back to the raw lowercased title so the
  // record stays valid and exact-matchable.
  const title_norm = normalizeTitle(title) || title.toLowerCase();
  const creators_norm = creators ? normalizeCreators(creators) || null : null;
  const dedupe_key = isbn13
    ? `i13:${isbn13}`
    : isbn10
      ? `i10:${isbn10}`
      : `ta:${title_norm}|${creators_norm ?? ""}`;

  return {
    title,
    creators,
    isbn13,
    isbn10,
    publisher: text(row.publisher, 300),
    publish_date: text(row.publish_date, 50),
    description: text(row.description, 5000),
    notes: text(row.notes, 2000),
    group_name: text(row.group, 300),
    tags: text(row.tags, 1000),
    item_type: text(row.item_type, 50),
    copies,
    title_norm,
    creators_norm,
    author_sort: authorSortKey(creators),
    dedupe_key,
  };
}

/** Merge duplicate rows (same dedupe key) by summing copies. */
export function mergeBooks(records: BookRecord[]): BookRecord[] {
  const map = new Map<string, BookRecord>();
  for (const r of records) {
    const existing = map.get(r.dedupe_key);
    if (existing) existing.copies += r.copies;
    else map.set(r.dedupe_key, { ...r });
  }
  return [...map.values()];
}

// ── Request matching ──────────────────────────────────────────────────────

export type Candidate = {
  id: number | string;
  title: string;
  creators: string | null;
  copies: number;
  title_norm: string;
  creators_norm: string | null;
};

export type MatchResult = {
  status: "found" | "insufficient" | "not_found";
  matched: { id: Candidate["id"]; title: string; creators: string | null; copies: number } | null;
  /** Top-scored near matches, for admin review. */
  candidates: { id: Candidate["id"]; title: string; creators: string | null; copies: number; score: number }[];
};

export const ACCEPT_SCORE = 0.75;
export const AUTHOR_AGREEMENT = 0.5;

export function scoreCandidate(
  reqTitleNorm: string,
  reqTitleShortNorm: string,
  reqAuthorNorm: string | null,
  reqAuthorTokens: Set<string>,
  cand: Candidate
): { score: number; authorSim: number } {
  const candShort = normalizeTitle(stripSubtitle(cand.title));
  const titleSim = Math.max(
    similarity(reqTitleNorm, cand.title_norm),
    similarity(reqTitleShortNorm, candShort),
    similarity(reqTitleShortNorm, cand.title_norm),
    similarity(reqTitleNorm, candShort)
  );

  // Without a requested author, author agreement is neutral.
  let authorSim = 1;
  let lastNameOverlap = false;
  if (reqAuthorNorm) {
    authorSim = cand.creators_norm ? similarity(reqAuthorNorm, cand.creators_norm) : 0;
    if (cand.creators_norm) {
      const candTokens = nameTokens(cand.creators_norm);
      for (const t of reqAuthorTokens) {
        if (candTokens.has(t)) lastNameOverlap = true;
      }
      if (lastNameOverlap) authorSim = Math.max(authorSim, 0.6);
    }
  }

  const exact = reqTitleNorm === cand.title_norm || reqTitleShortNorm === candShort;
  const score =
    0.6 * titleSim + 0.25 * authorSim + (exact ? 0.15 : 0) + (lastNameOverlap ? 0.1 : 0);
  return { score: Math.min(1, score), authorSim };
}

export function chooseMatch(
  request: { title: string; author?: string | null; copies: number },
  candidates: Candidate[]
): MatchResult {
  const reqTitleNorm = normalizeTitle(request.title) || request.title.toLowerCase().trim();
  const reqTitleShortNorm =
    normalizeTitle(stripSubtitle(request.title)) || reqTitleNorm;
  const reqAuthorNorm = request.author ? normalizeCreators(request.author) : null;
  const reqAuthorTokens = request.author ? nameTokens(request.author) : new Set<string>();

  const scored = candidates
    .map((c) => {
      const { score, authorSim } = scoreCandidate(
        reqTitleNorm,
        reqTitleShortNorm,
        reqAuthorNorm,
        reqAuthorTokens,
        c
      );
      return { cand: c, score, authorSim };
    })
    .sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3).map((s) => ({
    id: s.cand.id,
    title: s.cand.title,
    creators: s.cand.creators,
    copies: s.cand.copies,
    score: Math.round(s.score * 100) / 100,
  }));

  const best = scored[0];
  const authorOk =
    !reqAuthorNorm || !best?.cand.creators_norm || best.authorSim >= AUTHOR_AGREEMENT;

  if (best && best.score >= ACCEPT_SCORE && authorOk) {
    const b = best.cand;
    return {
      status: b.copies >= request.copies ? "found" : "insufficient",
      matched: { id: b.id, title: b.title, creators: b.creators, copies: b.copies },
      candidates: top3,
    };
  }
  return { status: "not_found", matched: null, candidates: top3 };
}

/** The human-readable tag line shown on the request. */
export function matchMessage(result: MatchResult, copiesRequested: number): string {
  if (result.status === "found") {
    return `Found: “${result.matched!.title}” — ${result.matched!.copies} ${
      result.matched!.copies === 1 ? "copy" : "copies"
    } in the library.`;
  }
  if (result.status === "insufficient") {
    return `Action required: we have “${result.matched!.title}” but only ${result.matched!.copies} of the ${copiesRequested} requested copies.`;
  }
  return "Action required: we don't have this book in the inventory.";
}
