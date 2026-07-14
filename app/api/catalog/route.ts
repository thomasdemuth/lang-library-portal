import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { isCategoryId } from "@/lib/tags";
import { searchCatalog } from "@/lib/catalog";

/**
 * The public-side catalog search: students and teachers can look up
 * books (read-only, no admin fields beyond what search results show).
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);
  const tagParam = req.nextUrl.searchParams.get("tag");
  const result = await searchCatalog({ q, page, tag: isCategoryId(tagParam) ? tagParam : null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...body } = result;
  return NextResponse.json(body);
});
