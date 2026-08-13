/**
 * The announcement strip above the top bar: which banner shows, to whom, and
 * how a dismissal is remembered.
 *
 * Pure and import-free (like lib/feedback.ts and lib/unified.ts) so it stays
 * edge-safe and unit-testable. The database side lives in lib/banners-store.ts.
 */

/** Accent, mapped onto the status tokens already in app/globals.css. */
export const TONES = ["info", "ok", "warn", "alert"] as const;
export type Tone = (typeof TONES)[number];

/** Icons the strip can carry — every one exists in components/icons.tsx. */
export const ICONS = ["sparkle", "megaphone", "bell", "note", "feedback"] as const;
export type BannerIcon = (typeof ICONS)[number];

export const AUDIENCES = ["all", "student", "staff"] as const;
export type BannerAudience = (typeof AUDIENCES)[number];

export function isTone(v: unknown): v is Tone {
  return typeof v === "string" && (TONES as readonly string[]).includes(v);
}
export function isBannerIcon(v: unknown): v is BannerIcon {
  return typeof v === "string" && (ICONS as readonly string[]).includes(v);
}
export function isBannerAudience(v: unknown): v is BannerAudience {
  return typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);
}

/** A row of the `banners` table, as the API and the picker see it. */
export type BannerRow = {
  id: number;
  message: string;
  cta_label: string | null;
  cta_href: string | null;
  cta_href_guest: string | null;
  audience: BannerAudience;
  tone: Tone;
  icon: string;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  dismiss_days: number;
  hide_when_answered: boolean;
  legacy_key: string | null;
  content_rev: number;
  created_at: string;
  updated_at: string;
};

/** Who is looking. Guests have no account and reach only Find a Book + the Map. */
export type Viewer = { audience: "student" | "staff"; isGuest?: boolean };

/** What the browser is given — no internal columns, link already resolved. */
export type ClientBanner = {
  id: number;
  /** content_rev — part of the dismissal key, so a rewrite un-dismisses it. */
  rev: number;
  message: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  tone: Tone;
  icon: string;
  dismissDays: number;
  hideWhenAnswered: boolean;
  legacyKey: string | null;
};

function ms(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** The link this viewer should get, or null if there isn't a usable one. */
export function hrefFor(row: BannerRow, isGuest = false): string | null {
  const href = isGuest ? row.cta_href_guest : row.cta_href;
  return href && href.trim() ? href.trim() : null;
}

/** Is this banner within its scheduled window right now? */
function inWindow(row: BannerRow, now: number): boolean {
  const starts = ms(row.starts_at);
  const ends = ms(row.ends_at);
  if (starts !== null && starts > now) return false;
  if (ends !== null && ends <= now) return false;
  return true;
}

/**
 * The one banner to show, out of everything the team has written.
 *
 * Several rows can be enabled at once — that is the queue. The winner is the
 * eligible banner that started most recently, so scheduling one for next
 * Monday means it takes over by itself when Monday comes, and the one it
 * replaces needs no end date to step aside. Ties (two banners with no start
 * date, or the same one) go to the newer row.
 *
 * A guest only sees banners that gave them somewhere to go: a banner with a
 * link they can't reach is worse than no banner. A banner with no link at all
 * is pure announcement and shows to everyone.
 */
export function pickActiveBanner(
  rows: readonly BannerRow[],
  now: number,
  viewer: Viewer
): BannerRow | null {
  const eligible = rows.filter((row) => {
    if (!row.enabled) return false;
    if (!inWindow(row, now)) return false;
    if (row.audience !== "all" && row.audience !== viewer.audience) return false;
    // Guests: hide it if it has a link they can't follow.
    if (viewer.isGuest && row.cta_href && !hrefFor(row, true)) return false;
    return true;
  });

  return (
    eligible
      .slice()
      .sort((a, b) => {
        const aStart = ms(a.starts_at) ?? ms(a.created_at) ?? 0;
        const bStart = ms(b.starts_at) ?? ms(b.created_at) ?? 0;
        return bStart - aStart || b.id - a.id;
      })[0] ?? null
  );
}

/** Row status for the management list. */
export type BannerState = "off" | "ended" | "scheduled" | "waiting" | "live";

/** The three kinds of visitor a banner can win for. */
export const VIEWERS: Viewer[] = [
  { audience: "student" },
  { audience: "staff" },
  { audience: "student", isGuest: true },
];

const viewerName = (v: Viewer) =>
  v.isGuest ? "Guests" : v.audience === "student" ? "Students" : "Teachers";

/**
 * How a row should read in the management list, judged against all the others.
 *
 * "waiting" is the state that would otherwise quietly confuse people: switched
 * on, inside its dates, and still invisible because another banner is winning.
 * Without it the list would claim two banners are live when only one is.
 */
export function describeBanner(
  row: BannerRow,
  rows: readonly BannerRow[],
  now: number
): { state: BannerState; liveFor: string[] } {
  const liveFor = VIEWERS.filter((v) => pickActiveBanner(rows, now, v)?.id === row.id).map(viewerName);
  if (liveFor.length > 0) return { state: "live", liveFor };
  if (!row.enabled) return { state: "off", liveFor };
  const ends = ms(row.ends_at);
  if (ends !== null && ends <= now) return { state: "ended", liveFor };
  const starts = ms(row.starts_at);
  if (starts !== null && starts > now) return { state: "scheduled", liveFor };
  return { state: "waiting", liveFor };
}

/**
 * Whether an edit should bring the banner back to people who dismissed it.
 * Changing what it SAYS or where it GOES is new information; changing its
 * color, its dates, or switching it off and on again is not.
 */
export function nextContentRev(
  current: number,
  before: Pick<BannerRow, "message" | "cta_label" | "cta_href" | "cta_href_guest">,
  after: Partial<Pick<BannerRow, "message" | "cta_label" | "cta_href" | "cta_href_guest">>,
  force = false
): number {
  if (force) return current + 1;
  const keys = ["message", "cta_label", "cta_href", "cta_href_guest"] as const;
  const changed = keys.some((k) => after[k] !== undefined && after[k] !== before[k]);
  return changed ? current + 1 : current;
}

/** The client-safe shape, with the right link already chosen for this viewer. */
export function toClientBanner(row: BannerRow, isGuest = false): ClientBanner {
  return {
    id: row.id,
    rev: row.content_rev,
    message: row.message,
    ctaLabel: row.cta_label,
    ctaHref: hrefFor(row, isGuest),
    tone: row.tone,
    icon: row.icon,
    dismissDays: row.dismiss_days,
    hideWhenAnswered: row.hide_when_answered,
    legacyKey: row.legacy_key,
  };
}

/**
 * Where a dismissal is remembered. The content revision is part of the KEY, so
 * rewriting a banner's wording asks again (a new key, nothing stored under it)
 * while merely switching it off and on again does not.
 */
export function dismissStorageKey(banner: Pick<ClientBanner, "id" | "rev">): string {
  return `lang_banner_${banner.id}r${banner.rev}`;
}

/**
 * Is this banner dismissed on this device? `stored` is the epoch-ms stamp
 * written when they hit × (a legacy key holds the same shape). A banner with
 * no dismiss window never comes back once hidden.
 */
export function isDismissed(
  banner: Pick<ClientBanner, "dismissDays">,
  stored: string | null,
  now: number
): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at) || at <= 0) return false;
  if (banner.dismissDays <= 0) return true; // no × window; hidden for good
  return now - at < banner.dismissDays * 24 * 3600 * 1000;
}

/**
 * Links a banner may point at: somewhere on this site, or an https URL.
 * Anything else — javascript:, data:, a protocol-relative //host — is rejected
 * rather than published across every page of the site.
 */
export function isAllowedHref(href: string): boolean {
  const v = href.trim();
  if (!v) return false;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/")) return true;
  return /^https:\/\/[^\s]+$/i.test(v);
}
