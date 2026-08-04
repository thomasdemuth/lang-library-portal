import { db } from "@/lib/db";
import { getActiveSyncId } from "@/lib/active-sync";
import { gbVolumesByIsbn } from "@/lib/googlebooks";
import { acceptOlMatch, type OlDoc } from "@/lib/enrich-match";

/**
 * Automated catalog enrichment. A nightly cron drips through books that are
 * missing a description, pulling from public sources (Open Library first,
 * Google Books as a small keyless fallback that resets daily). Each book
 * carries an `enrich_attempted_at` stamp so the query is a self-throttling
 * priority queue — never-tried books first, then the longest-ago-tried —
 * which spreads ~8k lookups over a few weeks and re-attempts stragglers as
 * quotas free up. Filling an ISBN also unlocks the cover proxy.
 *
 * Books with an ISBN are looked up BY that ISBN, which is exact. Books without
 * one can only be searched by title, which is a guess — every such guess has to
 * clear lib/enrich-match's acceptOlMatch before anything is written, because
 * nobody reads this cron's output before it lands in the live catalog.
 */

const FETCH_MS = 4500;
const WAVE = 12; // books fetched in parallel per pass
const UA = { "User-Agent": "LangLibraryPortal/1.0 (library@thelangschool.org)" };

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; isbn10: string | null };

function pickDesc(d: unknown): string | null {
  if (typeof d === "string") return d.trim() || null;
  if (d && typeof d === "object" && typeof (d as { value?: string }).value === "string") {
    return (d as { value: string }).value.trim() || null;
  }
  return null;
}

/** Open Library: description via the edition, then its work. */
async function olDescription(isbn: string): Promise<string | null> {
  try {
    const ed = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { signal: AbortSignal.timeout(FETCH_MS), headers: UA });
    if (!ed.ok) return null;
    const edition = await ed.json();
    const direct = pickDesc(edition.description);
    if (direct) return direct;
    const workKey: string | undefined = edition.works?.[0]?.key;
    if (!workKey) return null;
    const wk = await fetch(`https://openlibrary.org${workKey}.json`, { signal: AbortSignal.timeout(FETCH_MS), headers: UA });
    if (!wk.ok) return null;
    return pickDesc((await wk.json()).description);
  } catch {
    return null;
  }
}

/**
 * Search Open Library by title (+author) for a book with no ISBN on file, and
 * keep only what acceptOlMatch vouches for. `skipped` says which writes the
 * hit was refused, so the nightly summary can show how often that happens.
 */
async function olSearch(
  book: { title: string; creators: string | null }
): Promise<{ isbn13: string | null; description: string | null; skipped: { isbn: boolean; description: boolean } }> {
  const none = { isbn13: null, description: null, skipped: { isbn: false, description: false } };
  try {
    const params = new URLSearchParams({ title: book.title, limit: "1", fields: "isbn,key,title,author_name" });
    if (book.creators) params.set("author", book.creators.split(/[,;/]/)[0].trim());
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, { signal: AbortSignal.timeout(FETCH_MS), headers: UA });
    if (!res.ok) return none;
    const doc = (await res.json()).docs?.[0] as OlDoc | undefined;
    if (!doc) return none;

    const accept = acceptOlMatch(book, doc);
    const candidateIsbn: string | null = (doc.isbn ?? []).find((i: string) => i.length === 13) ?? null;
    let description: string | null = null;
    if (accept.description && doc.key) {
      const wk = await fetch(`https://openlibrary.org${doc.key}.json`, { signal: AbortSignal.timeout(FETCH_MS), headers: UA });
      if (wk.ok) description = pickDesc((await wk.json()).description);
    }
    return {
      isbn13: accept.isbn ? candidateIsbn : null,
      description,
      // isbn: an ISBN was on offer and we turned it down. description: we
      // declined to even read the work record (it may not have had one).
      skipped: { isbn: !accept.isbn && Boolean(candidateIsbn), description: !accept.description },
    };
  } catch {
    return none;
  }
}

/** Google Books description by ISBN (small keyless quota — used only as a fallback). */
async function gbDescription(isbn: string): Promise<string | null | "quota"> {
  try {
    const res = await fetch(gbVolumesByIsbn(isbn), { signal: AbortSignal.timeout(FETCH_MS) });
    if (res.status === 429) return "quota";
    if (!res.ok) return null;
    const v = (await res.json())?.items?.[0]?.volumeInfo;
    return v?.description ? String(v.description).trim() || null : null;
  } catch {
    return null;
  }
}

export type EnrichResult = {
  scanned: number;
  filledDesc: number;
  filledIsbn: number;
  /** Title-search hits refused by acceptOlMatch — the guard's visible output. */
  skippedIsbn: number;
  skippedDesc: number;
  gbQuotaHit: boolean;
  done: boolean;
};

/**
 * Drip-enrich the active generation for up to `timeBudgetMs`. Safe to call
 * repeatedly; each call advances the queue. Returns quietly (done:true) if
 * there's nothing to do or the schema isn't migrated yet.
 */
export async function enrichDrip(timeBudgetMs: number): Promise<EnrichResult> {
  const started = Date.now();
  let scanned = 0;
  let filledDesc = 0;
  let filledIsbn = 0;
  let skippedIsbn = 0;
  let skippedDesc = 0;
  let gbQuotaHit = false;
  const summary = (done: boolean): EnrichResult => ({
    scanned,
    filledDesc,
    filledIsbn,
    skippedIsbn,
    skippedDesc,
    gbQuotaHit,
    done,
  });

  const activeId = await getActiveSyncId();
  if (!activeId) return summary(true);

  while (Date.now() - started < timeBudgetMs) {
    const { data, error } = await db()
      .from("books")
      .select("id, title, creators, isbn13, isbn10")
      .eq("sync_id", activeId)
      .is("description", null)
      .order("enrich_attempted_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .limit(WAVE);
    // Pre-migration (no enrich_attempted_at column): bail quietly.
    if (error) return summary(true);
    const books = (data ?? []) as Book[];
    if (books.length === 0) return summary(true);

    await Promise.all(
      books.map(async (b) => {
        const isbn = b.isbn13 || b.isbn10;
        let description: string | null = null;
        let newIsbn13: string | null = null;
        if (isbn) {
          description = await olDescription(isbn);
          if (!description && !gbQuotaHit) {
            const gb = await gbDescription(isbn);
            if (gb === "quota") gbQuotaHit = true;
            else description = gb;
          }
        } else if (b.title) {
          const hit = await olSearch({ title: b.title, creators: b.creators });
          description = hit.description;
          if (hit.isbn13 && !b.isbn13) newIsbn13 = hit.isbn13;
          if (hit.skipped.isbn) skippedIsbn++;
          if (hit.skipped.description) skippedDesc++;
        }
        const patch: Record<string, unknown> = { enrich_attempted_at: new Date().toISOString() };
        if (description) patch.description = description.slice(0, 5000);
        if (newIsbn13) patch.isbn13 = newIsbn13;
        const { error: uErr } = await db().from("books").update(patch).eq("id", b.id);
        if (!uErr) {
          scanned++;
          if (patch.description) filledDesc++;
          if (patch.isbn13) filledIsbn++;
        }
      })
    );
  }
  return summary(false);
}

/** How much of the active catalog now has a description (for the status line). */
export async function enrichProgress(): Promise<{ total: number; withDescription: number }> {
  const activeId = await getActiveSyncId();
  if (!activeId) return { total: 0, withDescription: 0 };
  const [{ count: total }, withDesc] = await Promise.all([
    db().from("books").select("id", { count: "exact", head: true }).eq("sync_id", activeId),
    db().from("books").select("id", { count: "exact", head: true }).eq("sync_id", activeId).not("description", "is", null),
  ]);
  return { total: total ?? 0, withDescription: withDesc.count ?? 0 };
}
