import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { hidesTeacherBooks, isCategoryId } from "@/lib/tags";
import { searchCatalog, type TeacherScope } from "@/lib/catalog";

// Per-browser only: the route sits behind a session and the answer now varies
// by who is asking (students never see books marked for teachers), so no
// shared cache should ever hold it.
const CACHE = { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" };

/**
 * The public-side catalog search: students and teachers can look up
 * books (read-only, no admin fields beyond what search results show).
 *
 * Books marked for teachers are simply not in the library as far as a student
 * or guest is concerned. `?teachers=only` lists just those — it's what the
 * Books for Teachers surfaces read, and it is refused for students rather
 * than quietly returning nothing, so the rule can't be probed.
 */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0);
  const tagParam = req.nextUrl.searchParams.get("tag");
  const wantsTeachersOnly = req.nextUrl.searchParams.get("teachers") === "only";

  if (wantsTeachersOnly && hidesTeacherBooks(session.aud)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const teachers: TeacherScope = hidesTeacherBooks(session.aud)
    ? "hide"
    : wantsTeachersOnly
      ? "only"
      : "all";

  const result = await searchCatalog({
    q,
    page,
    tag: isCategoryId(tagParam) ? tagParam : null,
    teachers,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...body } = result;
  return NextResponse.json(body, { headers: CACHE });
});
