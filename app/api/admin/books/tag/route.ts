import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { CATEGORY_IDS } from "@/lib/categories";

const Body = z.object({
  book_key: z.string().min(1).max(600),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]).nullable(),
  /** Additive: a book can be Fiction AND for teachers. Omitted = leave as-is. */
  teachers: z.boolean().optional(),
});

/**
 * Set a book's tags. `category` is the shelf category (null clears it);
 * `teachers` is the separate "students can't see this" flag and rides
 * alongside it. When both end up empty the row is deleted rather than left
 * behind saying nothing.
 */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { book_key, category, teachers } = parsed.data;

  // The flag is only meaningful next to whatever it already was, so read the
  // current row when the caller didn't state it.
  let nextTeachers = teachers;
  if (nextTeachers === undefined) {
    const current = await db().from("book_tags").select("teachers").eq("book_key", book_key).maybeSingle();
    nextTeachers = (current.data as { teachers?: boolean } | null)?.teachers === true;
  }

  const result =
    category || nextTeachers
      ? await db().from("book_tags").upsert({
          book_key,
          category,
          teachers: nextTeachers,
          updated_at: new Date().toISOString(),
          updated_by: admin.id,
        })
      : await db().from("book_tags").delete().eq("book_key", book_key);

  if (result.error) {
    if (/teachers|column/i.test(result.error.message ?? "")) {
      return NextResponse.json(
        { error: "The Teachers tag needs migration 0026 — run it in the Supabase SQL editor." },
        { status: 409 }
      );
    }
    if (/book_tags|relation|does not exist/i.test(result.error.message ?? "")) {
      return NextResponse.json(
        { error: "Tags aren't set up yet — run the pending database migration first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tag: category, teachers: nextTeachers });
});
