/**
 * The quick-feedback vocabulary: what we ask about, and the tappable chips
 * offered for each star rating. Both the browser and the API import from here,
 * so the server can check that a submitted chip is one we actually offered
 * instead of storing whatever the request body claimed.
 *
 * Pure and import-free (like lib/categories.ts and lib/unified.ts) so it stays
 * edge-safe and unit-testable.
 */

/** What a piece of feedback is *about*. */
export const TOPICS = ["website", "library"] as const;
export type Topic = (typeof TOPICS)[number];

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}

/** Where a submission came in from. */
export const SOURCES = ["form", "banner", "qr"] as const;
export type Source = (typeof SOURCES)[number];

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** At most this many chips per submission (the UI never offers more). */
export const MAX_TAGS = 6;

/**
 * Ratings collapse into three chip sets. 3 stars is its own bucket rather than
 * being lumped in with the good or the bad — "it's fine, I'm still getting used
 * to it" is the most common honest answer to a relaunch, and it deserves chips
 * that say that.
 */
export type Bucket = "low" | "mid" | "high";

export function bucketFor(rating: number): Bucket {
  if (rating <= 2) return "low";
  if (rating === 3) return "mid";
  return "high";
}

/**
 * The chips, per topic and bucket. Kept short and concrete: the whole point is
 * that someone can answer usefully without typing anything. Editing this list
 * is safe — chips are stored as plain text, so removing one only stops it being
 * offered, it never rewrites feedback already collected.
 */
export const CHIPS: Record<Topic, Record<Bucket, readonly string[]>> = {
  website: {
    high: ["Easy to find books", "Looks great", "Fast", "Fun to use", "Better than before"],
    mid: ["Takes getting used to", "Mostly works", "A bit confusing", "Missing something"],
    low: ["Hard to find things", "Confusing", "Something's broken", "Slow", "I miss the old way"],
  },
  library: {
    high: ["Easy to find", "Looks great", "Comfy to sit", "Clear signs", "Well organized"],
    mid: ["Still finding my way", "Signs could be clearer", "A bit crowded", "Almost there"],
    low: [
      "Can't find things",
      "Signs are unclear",
      "Too crowded",
      "Nowhere to sit",
      "Books in the wrong place",
    ],
  },
};

/** The chips to offer for a rating, or [] if the rating is out of range. */
export function chipsFor(topic: Topic, rating: number): readonly string[] {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) return [];
  return CHIPS[topic][bucketFor(rating)];
}

/** Every chip this topic can ever produce — the server's allow-list. */
export function allChipsFor(topic: Topic): readonly string[] {
  const { low, mid, high } = CHIPS[topic];
  return [...low, ...mid, ...high];
}

/**
 * Server-side filter: keep only chips this topic actually offers, drop
 * duplicates, and cap the count. Anything else in the request body is
 * discarded silently — a forged chip is not worth a 400 that would lose the
 * rest of an otherwise good submission.
 */
export function validTags(topic: Topic, tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const allowed = new Set(allChipsFor(topic));
  const out: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string" || !allowed.has(tag) || out.includes(tag)) continue;
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** The star row's accessible label — also the summary shown after sending. */
export function ratingLabel(rating: number): string {
  const labels: Record<number, string> = {
    1: "Not good",
    2: "Could be better",
    3: "It's OK",
    4: "Good",
    5: "Great",
  };
  return labels[rating] ?? "";
}
