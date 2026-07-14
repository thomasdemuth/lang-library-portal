import type { CategoryId } from "@/lib/categories";

/**
 * Tag suggestions. Scores every category against the signals we can get
 * for a book — external subject headings (Open Library / Google Books)
 * plus "this author's other books are already tagged X" — and reports
 * the winner with a confidence estimate. Heuristic by design: the
 * librarian always confirms or overrides.
 *
 * Subject-heading conventions that carry most of the weight:
 *  - "juvenile fiction" = children's FICTION; "juvenile literature" =
 *    children's NONFICTION (both OL and LC use this split).
 *  - Picture books / board books / early & beginner readers → Young Reader.
 *  - "comics", "graphic novels", "manga", "cartoons" → Comics.
 *  - "drama", "plays", theater → Drama.
 */

type Rule = { pattern: RegExp; tag: CategoryId; weight: number };

const RULES: Rule[] = [
  // comics — strong, specific vocabulary
  { pattern: /comic|graphic novel|manga|cartoons?\b/, tag: "comics", weight: 5 },
  // drama
  { pattern: /\bdrama\b|\bplays?\b|theater|theatre|shakespeare/, tag: "drama", weight: 4 },
  // young reader — reading-level markers
  { pattern: /picture books?|board books?|early reader|beginner reader|easy read|readers? \(primary\)|i can read|step into reading|read[- ]along/, tag: "young", weight: 5 },
  { pattern: /\bkindergarten\b|preschool|nursery/, tag: "young", weight: 3 },
  // nonfiction — the "juvenile literature" convention + subject areas
  { pattern: /juvenile literature|nonfiction|non-fiction/, tag: "nonfiction", weight: 5 },
  { pattern: /biograph|history|science|mathematics|geography|nature|animals\b|poetry|dictionar|encyclopedi|reference|handbook|cook(book|ing)|sports?\b|art\b|music\b|crafts?\b/, tag: "nonfiction", weight: 2 },
  // fiction — the LC "juvenile fiction" heading is a strong signal…
  { pattern: /juvenile fiction/, tag: "fiction", weight: 4 },
  // …the generic vocabulary much less so
  { pattern: /\bfiction\b|\bnovels?\b|\bstories\b|fairy tales|legends|\bfantasy\b|mystery|adventure/, tag: "fiction", weight: 2 },
];

export type Suggestion = {
  tag: CategoryId;
  /** 0–100, calibrated roughly: >70 trustworthy, 40–70 check it, <40 shaky */
  confidence: number;
  reasons: string[];
};

export function suggestTag(
  subjects: string[],
  opts: { authorTag?: CategoryId | null; authorTagCount?: number } = {}
): Suggestion | null {
  const scores = new Map<CategoryId, number>();
  const reasons = new Map<CategoryId, string[]>();
  const seen = new Set<string>();

  for (const raw of subjects) {
    const s = raw.toLowerCase();
    for (const rule of RULES) {
      const m = s.match(rule.pattern);
      if (!m) continue;
      const key = `${rule.tag}:${m[0]}`;
      if (seen.has(key)) continue; // count each distinct cue once
      seen.add(key);
      scores.set(rule.tag, (scores.get(rule.tag) ?? 0) + rule.weight);
      const r = reasons.get(rule.tag) ?? [];
      if (r.length < 3) r.push(`“${m[0]}”`);
      reasons.set(rule.tag, r);
    }
  }

  // Books by an author the library has already tagged lean the same way.
  if (opts.authorTag && (opts.authorTagCount ?? 0) > 0) {
    const w = Math.min(4, 2 + (opts.authorTagCount ?? 1));
    scores.set(opts.authorTag, (scores.get(opts.authorTag) ?? 0) + w);
    const r = reasons.get(opts.authorTag) ?? [];
    r.push(`author's other book${(opts.authorTagCount ?? 0) > 1 ? "s are" : " is"} tagged this`);
    reasons.set(opts.authorTag, r);
  }

  if (scores.size === 0) return null;

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [tag, top] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const total = [...scores.values()].reduce((a, b) => a + b, 0);

  // Confidence: how much evidence, and how decisively it beats the rest.
  const strength = Math.min(1, top / 7);
  const margin = total === 0 ? 0 : (top - runnerUp) / total;
  const confidence = Math.round(100 * (0.45 * strength + 0.55 * Math.max(margin, top === total ? 0.9 : margin)));

  return { tag, confidence: Math.max(20, Math.min(97, confidence)), reasons: reasons.get(tag) ?? [] };
}
