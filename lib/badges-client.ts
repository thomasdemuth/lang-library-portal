"use client";

import { BADGES, emptyStats, getBadge, type Badge, type BadgeStats } from "./badges";
import { withBase } from "./base";

/**
 * One shared badge cache for the whole student session, in the same shape as
 * lib/favorites-client.ts: a module-level snapshot, a single in-flight fetch,
 * and subscriber sets.
 *
 * Two separate channels come out of it:
 *   • onBadgesChange — "the numbers moved", for the shelf on My Page.
 *   • onCelebrate    — "throw a party", for the single host mounted in the
 *                      student layout. Nothing else needs to know a badge was
 *                      earned, so no surface prop-drills a callback: an action
 *                      just calls refreshBadges() and forgets about it.
 */

export type BadgeState = {
  stats: BadgeStats;
  earned: Set<string>;
  earnedAt: Map<string, string | null>;
  /** 0027 hasn't run — "seen" is remembered in this browser instead. */
  migrationPending: boolean;
};

export type Celebration = { kind: "badge"; badge: Badge } | { kind: "welcome" };

const SEEN_KEY = "ll-badges-seen";
const WELCOMED_KEY = "ll-welcomed";
/** Actions arrive in bursts (log a read → refresh, heart it → refresh). */
const THROTTLE_MS = 1500;

let state: BadgeState = { stats: emptyStats(), earned: new Set(), earnedAt: new Map(), migrationPending: false };
let loaded = false;
let inflight: Promise<BadgeState> | null = null;
let lastFetch = 0;

const changeListeners = new Set<(s: BadgeState) => void>();
const celebrateListeners = new Set<(c: Celebration) => void>();
/** Slugs already popped in THIS page session — belt and braces over `seen_at`. */
const celebrated = new Set<string>();

export function onBadgesChange(fn: (s: BadgeState) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function onCelebrate(fn: (c: Celebration) => void): () => void {
  celebrateListeners.add(fn);
  return () => celebrateListeners.delete(fn);
}

/** The badge state as last fetched — safe to read during render. */
export function badgeState(): BadgeState {
  return state;
}

export function badgesLoaded(): boolean {
  return loaded;
}

function notifyChange() {
  for (const fn of changeListeners) fn(state);
}

function emit(c: Celebration) {
  for (const fn of celebrateListeners) fn(c);
}

// ── The local "seen" ledger, used only until migration 0027 runs ──────────
function localSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberLocally(slugs: string[]) {
  try {
    const set = localSeen();
    for (const s of slugs) set.add(s);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    /* private mode / storage full — the badge just pops once more */
  }
}

type Payload = {
  stats?: BadgeStats;
  earned?: { slug: string; earned_at: string | null }[];
  unseen?: string[];
  welcome?: boolean;
  migrationPending?: boolean;
};

function apply(d: Payload): BadgeState {
  const earned = new Set<string>();
  const earnedAt = new Map<string, string | null>();
  for (const row of d.earned ?? []) {
    earned.add(row.slug);
    earnedAt.set(row.slug, row.earned_at);
  }
  state = {
    stats: { ...emptyStats(), ...(d.stats ?? {}) },
    earned,
    earnedAt,
    migrationPending: Boolean(d.migrationPending),
  };
  loaded = true;

  // Welcome first — it sets the scene for any badge that follows it. The
  // local guard is what covers the pre-0027 case, where the server can't yet
  // remember that this student has already been welcomed.
  if (d.welcome && !localSeenWelcome()) emit({ kind: "welcome" });

  // Then the badges, in shelf order, so a double-earn queues predictably.
  const pending = new Set(d.unseen ?? []);
  const localled = state.migrationPending ? localSeen() : null;
  for (const b of BADGES) {
    if (!pending.has(b.slug) || celebrated.has(b.slug)) continue;
    if (localled?.has(b.slug)) continue;
    celebrated.add(b.slug);
    emit({ kind: "badge", badge: b });
  }

  notifyChange();
  return state;
}

function localSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return false;
  }
}

async function load(): Promise<BadgeState> {
  lastFetch = Date.now();
  try {
    const res = await fetch(withBase("/api/play/badges"));
    if (!res.ok) return state;
    return apply((await res.json()) as Payload);
  } catch {
    return state; // offline: keep whatever we had, try again next action
  }
}

/** The cached state, fetching it once if this is the first ask. */
export async function getBadges(): Promise<BadgeState> {
  if (loaded) return state;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Re-read after an action that could have earned something. Fire-and-forget:
 * callers never await it, and a burst of actions collapses into one request.
 */
export async function refreshBadges(): Promise<BadgeState> {
  if (inflight) return inflight;
  if (loaded && Date.now() - lastFetch < THROTTLE_MS) return state;
  inflight = load().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The celebration was shown — never fire it again, on any device. */
export async function markSeen(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  rememberLocally(slugs); // covers the pre-0027 case and a failed POST
  try {
    await fetch(withBase("/api/play/badges"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen", slugs }),
    });
  } catch {
    /* offline — the local ledger holds until the next successful load */
  }
}

export async function markWelcomed(): Promise<void> {
  try {
    window.localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    /* ignore */
  }
  try {
    await fetch(withBase("/api/play/badges"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "welcomed" }),
    });
  } catch {
    /* ignore */
  }
}

// ── The running read count, for the "I read this" toast ───────────────────
// Kept optimistic so the praise line names the right number the instant the
// student taps, without waiting for a round trip.
let readDelta = 0;

/** Books logged this session's best guess — 0 when we haven't loaded yet. */
export function readCount(): number {
  if (!loaded) return 0;
  return Math.max(0, state.stats.booksLogged + readDelta);
}

export function bumpRead(delta: number): void {
  readDelta += delta;
}

/** Reset the optimistic delta once a fetch has told us the real number. */
onBadgesChange(() => {
  readDelta = 0;
});

/** Badge lookup that doesn't drag the whole definition list into a component. */
export { getBadge };
