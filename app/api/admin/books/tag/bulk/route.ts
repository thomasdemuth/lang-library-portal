import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { CATEGORY_IDS } from "@/lib/categories";

const Body = z.object({
  book_keys: z.array(z.string().min(1).max(600)).min(1).max(2000),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]).nullable(),
});

/** Set (or clear, with category: null) the tag on many books at once. */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { book_keys, category } = parsed.data;
  const keys = [...new Set(book_keys)];

  const now = new Date().toISOString();
  const result = category
    ? await db()
        .from("book_tags")
        .upsert(keys.map((book_key) => ({ book_key, category, updated_at: now, updated_by: admin.id })))
    : await db().from("book_tags").delete().in("book_key", keys);

  if (result.error) {
    if (/book_tags|relation|does not exist/i.test(result.error.message ?? "")) {
      return NextResponse.json(
        { error: "Tags aren't set up yet — run the pending database migration first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: keys.length, tag: category });
});
