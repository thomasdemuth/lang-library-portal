import { db, dbConfigured } from "@/lib/db";
import {
  pickActiveBanner,
  toClientBanner,
  type BannerRow,
  type ClientBanner,
  type Viewer,
} from "@/lib/banners";

/**
 * Reading the banner table on the hot path.
 *
 * Every page of both portals renders the strip, so this runs on essentially
 * every request. The repo uses no Next caching APIs — everything is
 * force-dynamic and each layout reads cookies — so the cache is a plain
 * module-level variable with a TTL, which is both the in-keeping choice and
 * the cheap one on a free-tier database.
 *
 * What that means in practice, and the admin page says so out loud: an edit is
 * live immediately on the instance that handled the write, and everywhere else
 * within a minute. Nobody is refreshing a page waiting for a banner, and the
 * alternative is a database round trip per page view.
 */

const COLS =
  "id, message, cta_label, cta_href, cta_href_guest, audience, tone, icon, enabled, " +
  "starts_at, ends_at, dismiss_days, hide_when_answered, legacy_key, content_rev, " +
  "created_at, updated_at";

const TTL_MS = 60_000;
/** Shorter, so a database blip or a pending migration recovers quickly. */
const EMPTY_TTL_MS = 10_000;

let cache: { at: number; ttl: number; rows: BannerRow[] } | null = null;

function remember(rows: BannerRow[], ttl: number): BannerRow[] {
  cache = { at: Date.now(), ttl, rows };
  return rows;
}

/**
 * Every banner, cached. Degrades to "no banners" rather than throwing: the
 * strip is the least important thing on the page, and a missing migration or
 * an unreachable database must not take every page down with it — the same
 * posture as lib/guards.ts retrying without role/permissions.
 */
export async function loadBanners(): Promise<BannerRow[]> {
  if (cache && Date.now() - cache.at < cache.ttl) return cache.rows;
  if (!dbConfigured()) return remember([], EMPTY_TTL_MS);

  try {
    const { data, error } = await db()
      .from("banners")
      .select(COLS)
      .eq("enabled", true)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(50);
    // Table not created yet (migration 0025 pending) — no banner, try again soon.
    if (error) return remember([], EMPTY_TTL_MS);
    return remember((data as unknown as BannerRow[]) ?? [], TTL_MS);
  } catch {
    return remember([], EMPTY_TTL_MS);
  }
}

/** Drop the cache after an admin write, so their own next page load is current. */
export function invalidateBanners(): void {
  cache = null;
}

/** The banner this viewer should see, ready to hand to the client component. */
export async function activeBannerFor(viewer: Viewer): Promise<ClientBanner | null> {
  const row = pickActiveBanner(await loadBanners(), Date.now(), viewer);
  return row ? toClientBanner(row, viewer.isGuest) : null;
}
