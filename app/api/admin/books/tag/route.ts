import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { CATEGORY_IDS } from "@/lib/categories";

const Body = z.object({
  book_key: z.string().min(1).max(600),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]).nullable(),
});

/** Set (or clear, with category: null) a book's category tag. */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "inventory_import");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { book_key, category } = parsed.data;

  const result = category
    ? await db()
        .from("book_tags")
        .upsert({ book_key, category, updated_at: new Date().toISOString(), updated_by: admin.id })
    : await db().from("book_tags").delete().eq("book_key", book_key);

  if (result.error) {
    if (/book_tags|relation|does not exist/i.test(result.error.message ?? "")) {
      return NextResponse.json(
        { error: "Tags aren't set up yet — run the pending database migration first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tag: category });
});
