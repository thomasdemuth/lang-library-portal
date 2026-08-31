/**
 * Badges — the student's collection.
 *
 * Badges are DERIVED, never stored. This module turns a `BadgeStats` snapshot
 * into "which badges are earned, and how close the next ones are". The
 * database keeps only a ledger of when each slug was earned and whether its
 * celebration has been seen (migration 0027), so the definitions below stay
 * editable in code — add a badge next term and everyone who already qualifies
 * gets it retroactively.
 *
 * Two rules hold everywhere in this file, and the tests enforce both:
 *
 *   1. Nothing here can ever feel like failure. Every `nudge` looks forward
 *      ("3 more books and it's yours"), never back at a miss. There are no
 *      streaks to break and no deadlines. A badge, once earned, is kept —
 *      `newlyEarned` can only ever return additions.
 *   2. Nothing here compares one reader to another. Every threshold is
 *      measured against the reader's own shelf.
 */

import { CATEGORY_IDS, type CategoryId } from "./categories";

/** Everything a badge can be earned from. All counts are non-negative. */
export type BadgeStats = {
  /** reading_log rows */
  booksLogged: number;
  /** favorites rows */
  favorites: number;
  /** collections holding at least one book */
  listsWithBooks: number;
  /** collection_books rows across all my lists */
  booksInLists: number;
  /** distinct book_tags.category across the books I've logged */
  genres: CategoryId[];
  /** checkouts ever made to me */
  takenHome: number;
  /** checkouts of mine that came back */
  broughtBack: number;
  /** friends rows */
  friends: number;
};

/** The shelf is grouped so every group can always show one reachable goal. */
export type BadgeGroup = "reading" | "hearts" | "lists" | "genres" | "trips" | "friends";

export type Badge = {
  /** Stable DB key — never rename one of these, the ledger is keyed on it. */
  slug: string;
  name: string;
  /** One warm sentence, shown on the medal and in the pop-up. */
  blurb: string;
  /** Key in components/icons.tsx ICON_PATHS. */
  icon: string;
  /** Medal color, from the site palette. */
  color: string;
  group: BadgeGroup;
  goal: number;
  /** How far along, in the same unit as `goal`. */
  progress: (s: BadgeStats) => number;
  /** Forward-looking "next up" copy. `left` is goal - progress, always >= 1. */
  nudge: (left: number) => string;
};

/** "Other" is a catch-all tag, so it can never be required for a genre badge. */
const REAL_CATEGORIES: readonly CategoryId[] = CATEGORY_IDS.filter((id) => id !== "other");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The collection, in shelf order. Grouped, so the grid on My Page reads as
 * sections without needing to sort at render time.
 */
export const BADGES: readonly Badge[] = [
  // ── Reading ──────────────────────────────────────────────────────────
  {
    slug: "first-page",
    name: "First Page",
    blurb: "Your reading log has begun.",
    icon: "book",
    color: "#2e50c8",
    group: "reading",
    goal: 1,
    progress: (s) => s.booksLogged,
    nudge: () => "Log a book you've finished.",
  },
  {
    slug: "bookworm",
    name: "Bookworm",
    blurb: "Five books in the log.",
    icon: "apple",
    color: "#4caf50",
    group: "reading",
    goal: 5,
    progress: (s) => s.booksLogged,
    nudge: (left) => `${plural(left, "more book")} and it's yours.`,
  },
  {
    slug: "page-turner",
    name: "Page Turner",
    blurb: "Ten books read and logged.",
    icon: "sparkle",
    color: "#e8a531",
    group: "reading",
    goal: 10,
    progress: (s) => s.booksLogged,
    nudge: (left) => `${plural(left, "more book")} and it's yours.`,
  },
  {
    slug: "story-collector",
    name: "Story Collector",
    blurb: "Twenty-five stories, all yours.",
    icon: "stack",
    color: "#7c4dbc",
    group: "reading",
    goal: 25,
    progress: (s) => s.booksLogged,
    nudge: (left) => `${plural(left, "more book")} to go.`,
  },
  {
    slug: "library-legend",
    name: "Library Legend",
    blurb: "Fifty books. The shelves know you.",
    icon: "medal",
    color: "#b2222c",
    group: "reading",
    goal: 50,
    progress: (s) => s.booksLogged,
    nudge: (left) => `${plural(left, "more book")} to go.`,
  },

  // ── Hearts ───────────────────────────────────────────────────────────
  {
    slug: "heart-collector",
    name: "Heart Collector",
    blurb: "Three books you loved.",
    icon: "heart",
    color: "#c2417f",
    group: "hearts",
    goal: 3,
    progress: (s) => s.favorites,
    nudge: (left) => `Heart ${plural(left, "more book")}.`,
  },
  {
    slug: "wall-of-hearts",
    name: "Wall of Hearts",
    blurb: "Fifteen favorites on your page.",
    icon: "heart",
    color: "#e82d86",
    group: "hearts",
    goal: 15,
    progress: (s) => s.favorites,
    nudge: (left) => `${plural(left, "more favorite")} to go.`,
  },

  // ── Lists ────────────────────────────────────────────────────────────
  {
    slug: "list-maker",
    name: "List Maker",
    blurb: "Your first book list, with a book in it.",
    icon: "folder",
    color: "#29ac9c",
    group: "lists",
    goal: 1,
    progress: (s) => s.listsWithBooks,
    nudge: () => "Put a book in a list.",
  },
  {
    slug: "curator",
    name: "Curator",
    blurb: "Ten books tucked into your lists.",
    icon: "folder",
    color: "#2e3b8e",
    group: "lists",
    goal: 10,
    progress: (s) => s.booksInLists,
    nudge: (left) => `${plural(left, "more book")} in your lists.`,
  },

  // ── Genres ───────────────────────────────────────────────────────────
  {
    slug: "genre-hopper",
    name: "Genre Hopper",
    blurb: "Books from three different kinds.",
    icon: "compass",
    color: "#a67c00",
    group: "genres",
    goal: 3,
    progress: (s) => countRealGenres(s.genres),
    nudge: (left) => `Try ${plural(left, "more kind")} of book.`,
  },
  {
    slug: "whole-shelf",
    name: "Whole-Shelf Reader",
    blurb: "One from every kind of book we have.",
    icon: "globe",
    color: "#29ac9c",
    group: "genres",
    goal: REAL_CATEGORIES.length,
    progress: (s) => countRealGenres(s.genres),
    nudge: (left) => `${plural(left, "kind")} left to try.`,
  },

  // ── Trips ────────────────────────────────────────────────────────────
  {
    slug: "book-traveler",
    name: "Book Traveler",
    blurb: "You took a book home.",
    icon: "backpack",
    color: "#7c4dbc",
    group: "trips",
    goal: 1,
    progress: (s) => s.takenHome,
    nudge: () => "Take a book home.",
  },
  {
    slug: "safe-return",
    name: "Safe Return",
    blurb: "You brought a book back.",
    icon: "usercheck",
    color: "#4caf50",
    group: "trips",
    goal: 1,
    progress: (s) => s.broughtBack,
    nudge: () => "Bring a book back.",
  },

  // ── Friends ──────────────────────────────────────────────────────────
  {
    slug: "book-buddy",
    name: "Book Buddy",
    blurb: "You added a reading friend.",
    icon: "userplus",
    color: "#2e50c8",
    group: "friends",
    goal: 1,
    progress: (s) => s.friends,
    nudge: () => "Add a reading friend.",
  },
];

/** Distinct real (non-"other") categories in a genre list. */
function countRealGenres(genres: readonly CategoryId[]): number {
  const seen = new Set<CategoryId>();
  for (const g of genres) if (REAL_CATEGORIES.includes(g)) seen.add(g);
  return seen.size;
}

/** A reader who has done nothing yet. */
export function emptyStats(): BadgeStats {
  return {
    booksLogged: 0,
    favorites: 0,
    listsWithBooks: 0,
    booksInLists: 0,
    genres: [],
    takenHome: 0,
    broughtBack: 0,
    friends: 0,
  };
}

export function getBadge(slug: string): Badge | undefined {
  return BADGES.find((b) => b.slug === slug);
}

/** Where one badge stands. `value` is clamped into [0, goal]. */
export function badgeProgress(b: Badge, s: BadgeStats): { value: number; goal: number; done: boolean } {
  const raw = b.progress(s);
  const value = Math.max(0, Math.min(b.goal, Number.isFinite(raw) ? raw : 0));
  return { value, goal: b.goal, done: value >= b.goal };
}

/** Earned slugs, in BADGES order — so celebrations queue up predictably. */
export function earnedSlugs(s: BadgeStats): string[] {
  return BADGES.filter((b) => badgeProgress(b, s).done).map((b) => b.slug);
}

/**
 * What to celebrate: badges in `after` that weren't in `before`, in BADGES
 * order. A shrinking set returns [] — the ledger is append-only and a badge
 * is never taken back (undoing a logged read must not un-earn anything).
 */
export function newlyEarned(before: Iterable<string>, after: Iterable<string>): Badge[] {
  const had = new Set(before);
  const has = new Set(after);
  return BADGES.filter((b) => has.has(b.slug) && !had.has(b.slug));
}

/**
 * The nearest unearned badge in each group — the one the shelf reveals by
 * name so every category always shows something concrete to aim at. Groups
 * whose badges are all earned are simply absent.
 */
export function nextInGroup(s: BadgeStats): Map<BadgeGroup, Badge> {
  const out = new Map<BadgeGroup, Badge>();
  for (const b of BADGES) {
    if (out.has(b.group)) continue; // BADGES order is easiest-first within a group
    if (!badgeProgress(b, s).done) out.set(b.group, b);
  }
  return out;
}
