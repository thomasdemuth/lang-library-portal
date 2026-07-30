import { db } from "@/lib/db";
import { normalizeGameTitle } from "@/lib/games";

/**
 * Server-side games search — the games counterpart to lib/catalog.searchCatalog.
 * Non-empty queries use the fuzzy + full-text search_games() RPC (migration
 * 0018) and fall back to the plain substring search if it hasn't run. Kept out
 * of lib/games.ts because that module is imported by client components (no db).
 */

const COLS = "id, title, subcategory, description, image_url, copies, condition, location, available";

export type GamesSearchResult =
  | { ok: true; games: unknown[] }
  | { ok: false; migrationPending: true }
  | { ok: false; status: number; error: string };

type DbErr = { code?: string; message?: string };
const rpcMissing = (e: DbErr) =>
  e.code === "PGRST202" || /could not find the function|search_games/i.test(e.message ?? "");
const tableMissing = (e: DbErr) =>
  e.code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(e.message ?? "");

export async function searchGames(opts: {
  q: string;
  subcategory: string | null;
  order: "title" | "subcategory";
}): Promise<GamesSearchResult> {
  const norm = normalizeGameTitle(opts.q);

  if (norm) {
    const { data, error } = await db().rpc("search_games", {
      p_q: opts.q,
      p_qnorm: norm,
      p_subcategory: opts.subcategory ?? null,
      p_limit: 500,
      p_offset: 0,
    });
    if (!error) {
      const games = ((data ?? []) as Array<Record<string, unknown>>).map(({ total_count: _d, ...g }) => g);
      return { ok: true, games };
    }
    // Distinguish "0018 RPC not created yet" (fall back) from a missing games
    // table (0017) or a real error. Check RPC-missing FIRST — its message also
    // contains "games".
    if (!rpcMissing(error)) {
      if (tableMissing(error)) return { ok: false, migrationPending: true };
      return { ok: false, status: 500, error: "Database error" };
    }
    // else: fall through to the legacy substring search below.
  }

  let query = db().from("games").select(COLS);
  if (norm) query = query.ilike("title_norm", `%${norm}%`);
  if (opts.subcategory) query = query.eq("subcategory", opts.subcategory);
  query = opts.order === "subcategory" ? query.order("subcategory").order("title") : query.order("title");

  const { data, error } = await query;
  if (error) {
    if (tableMissing(error)) return { ok: false, migrationPending: true };
    return { ok: false, status: 500, error: "Database error" };
  }
  return { ok: true, games: data ?? [] };
}
