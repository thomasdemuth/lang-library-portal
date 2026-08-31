import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { CATEGORY_IDS, type CategoryId } from "@/lib/categories";

const Body = z
  .object({
    book_keys: z.array(z.string().min(1).max(600)).min(1).max(2000),
    /** Omitted = leave each book's own category alone. */
    category: z.enum(CATEGORY_IDS as [string, ...string[]]).nullable().optional(),
    /** Omitted = leave each book's own Teachers flag alone. */
    teachers: z.boolean().optional(),
  })
  .refine((b) => b.category !== undefined || b.teachers !== undefined, {
    message: "Nothing to change",
  });

/**
 * Set the category and/or the Teachers flag across many books at once.
 *
 * Either field can be left out, and leaving one out means "don't touch it" —
 * marking a shelf of books for teachers must not wipe the categories someone
 * spent an afternoon setting, and re-categorizing a shelf must not quietly
 * hand teacher-only books back to the students.
 */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { book_keys, category, teachers } = parsed.data;
  const keys = [...new Set(book_keys)];
  const now = new Date().toISOString();

  const fail = (error: { message?: string } | null) => {
    if (/teachers|column/i.test(error?.message ?? "")) {
      return NextResponse.json(
        { error: "The Teachers tag needs migration 0027 — run it in the Supabase SQL editor." },
        { status: 409 }
      );
    }
    if (/book_tags|relation|does not exist/i.test(error?.message ?? "")) {
      return NextResponse.json(
        { error: "Tags aren't set up yet — run the pending database migration first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  };

  // The rows a book already has, so the field we're NOT setting survives.
  type Existing = { book_key: string; category: CategoryId | null; teachers: boolean };
  let existing = new Map<string, Existing>();
  if (category === undefined || teachers === undefined) {
    const current = await db().from("book_tags").select("book_key, category, teachers").in("book_key", keys);
    if (current.error) return fail(current.error);
    existing = new Map(
      ((current.data ?? []) as unknown as Existing[]).map((r) => [
        r.book_key,
        { ...r, teachers: r.teachers === true },
      ])
    );
  }

  const rows = keys.map((book_key) => {
    const was = existing.get(book_key);
    return {
      book_key,
      category: category === undefined ? (was?.category ?? null) : category,
      teachers: teachers === undefined ? (was?.teachers ?? false) : teachers,
      updated_at: now,
      updated_by: admin.id,
    };
  });

  // A row saying nothing gets deleted rather than left behind.
  const empty = rows.filter((r) => !r.category && !r.teachers).map((r) => r.book_key);
  const keep = rows.filter((r) => r.category || r.teachers);

  if (keep.length > 0) {
    const { error } = await db().from("book_tags").upsert(keep);
    if (error) return fail(error);
  }
  if (empty.length > 0) {
    const { error } = await db().from("book_tags").delete().in("book_key", empty);
    if (error) return fail(error);
  }

  return NextResponse.json({ ok: true, count: keys.length, tag: category ?? null, teachers });
});
