import { db } from "@/lib/db";

/**
 * Tiny key→value site-settings store (migration 0026). Server-side only.
 * Reads degrade to the caller's default when the table hasn't been migrated
 * yet — a missing setting must never take a page or an API route down.
 */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await db().from("site_settings").select("value").eq("key", key).maybeSingle();
    if (error || data == null) return fallback;
    return data.value as T;
  } catch {
    return fallback;
  }
}

/** Upsert one setting. Resolves false when the write failed (e.g. pre-migration). */
export async function setSetting(key: string, value: unknown, adminId: string | null): Promise<boolean> {
  const { error } = await db()
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: adminId }, { onConflict: "key" });
  return !error;
}
