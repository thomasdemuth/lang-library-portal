import { NextRequest, NextResponse } from "next/server";
import { guarded, requirePermission } from "@/lib/guards";
import { isCategoryId } from "@/lib/tags";
import { searchCatalog } from "@/lib/catalog";

/** Search the active inventory generation, optionally filtered by tag. */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);
  const tagParam = req.nextUrl.searchParams.get("tag");
  const result = await searchCatalog({
    q,
    page,
    tag: isCategoryId(tagParam) ? tagParam : null,
    untagged: req.nextUrl.searchParams.get("untagged") === "1",
    sort: "author", // admin inventory + tag-review queue order by author surname
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...body } = result;
  return NextResponse.json(body);
});
