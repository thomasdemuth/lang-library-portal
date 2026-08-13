import { db, dbConfigured } from "@/lib/db";
import type { Source, Topic } from "@/lib/feedback";
import type { SpotShelf } from "@/lib/feedback-spots";

/**
 * The one place feedback is written, so the two POST routes (signed-in and
 * anonymous) can't drift on how a row is shaped or how failures degrade.
 */

export type FeedbackRow = {
  audience: "student" | "staff" | "public";
  email: string | null;
  name: string | null;
  message: string | null;
  rating: number | null;
  tags: string[];
  topic: Topic | null;
  spot: string | null;
  source: Source;
};

/** The columns that existed before migration 0024. */
function legacyRow(row: FeedbackRow) {
  return {
    audience: row.audience,
    email: row.email,
    name: row.name,
    // Pre-0024 the column is NOT NULL with a 3-character floor, so a star-only
    // submission has to be spelled out as prose to survive the fallback.
    message: row.message ?? describeSignals(row),
  };
}

/** "4/5 stars — Fast, Looks great" — the readable form of a chips-only reply. */
export function describeSignals(row: Pick<FeedbackRow, "rating" | "tags">): string {
  const parts: string[] = [];
  if (row.rating !== null) parts.push(`${row.rating}/5 stars`);
  if (row.tags.length) parts.push(row.tags.join(", "));
  return parts.join(" — ") || "(no comment)";
}

/**
 * Insert a feedback row, degrading to the pre-0024 column set if the database
 * doesn't have the new ones yet. Deploys and SQL migrations are applied
 * separately here (see README), and losing a student's feedback because the
 * migration hasn't been run yet would be the wrong way to fail — the same
 * reason lib/guards.ts retries the admin lookup without role/permissions.
 *
 * Returns true when the row landed.
 */
export async function insertFeedback(row: FeedbackRow): Promise<boolean> {
  const { error } = await db().from("feedback").insert(row);
  if (!error) return true;

  // Anonymous rows can't be saved at all pre-0024: email is NOT NULL and
  // 'public' fails the audience check. Better to report the failure than to
  // invent an email address for someone who chose not to give one.
  if (row.audience === "public" || row.email === null) return false;

  if (!/column|schema cache|constraint/i.test(error.message ?? "")) return false;
  const retry = await db().from("feedback").insert(legacyRow(row));
  return !retry.error;
}

/**
 * The map zones, in the shape lib/feedback-spots needs to derive QR codes.
 * Same shelf_number resilience as app/api/map/route.ts: pre-0003 databases
 * don't have that column, and a poster sheet is not worth a 500.
 */
export async function loadSpotShelves(): Promise<SpotShelf[]> {
  if (!dbConfigured()) return [];
  const columns = "label, category, shelf_number, sort";
  try {
    const { data, error } = await db()
      .from("shelves")
      .select(columns)
      .order("sort", { ascending: true });
    if (!error) return (data as SpotShelf[]) ?? [];

    const retry = await db()
      .from("shelves")
      .select(columns.replace(", shelf_number", ""))
      .order("sort", { ascending: true });
    // The runtime-built select string defeats the client's column inference.
    return (retry.data as unknown as SpotShelf[]) ?? [];
  } catch {
    // No zones means every code resolves to the library as a whole — the
    // poster page still loads and still collects feedback, which matters more
    // than naming the right shelf.
    return [];
  }
}
