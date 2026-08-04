import { db } from "@/lib/db";

const TTL_MS = 60_000;

let cached: { id: number | null; at: number } | null = null;

/**
 * The id of the live inventory generation. Almost every catalog read needs it
 * and it only changes when an import is activated, so it's memoized for a
 * minute instead of costing a round trip per request. A lookup that errors is
 * never cached — it degrades to "no inventory" exactly as the raw query did.
 */
export async function getActiveSyncId(): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;

  const { data, error } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (error) return null;

  const id = (data?.id as number | undefined) ?? null;
  cached = { id, at: Date.now() };
  return id;
}

/** Drop the memo so a freshly activated generation is visible immediately. */
export function invalidateActiveSync(): void {
  cached = null;
}
