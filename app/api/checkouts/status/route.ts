import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";

/**
 * The full "who has what" list for teachers and management — every open
 * checkout, soonest-due first. Teachers get it read-only-plus-check-in by
 * design (decided with the library team): at the shelf, any adult should
 * be able to answer "who took this?" and record a hand-back.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireStaff(req);
  // All-literal filter text (see /api/admin/circulation): `.or()` strings
  // have structural syntax, so everything outside [a-z0-9 .@-] is dropped.
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().replace(/[^a-z0-9 .@-]/g, "").trim();

  let query = db()
    .from("checkouts")
    .select("id, book_key, title, isbn13, student_email, checked_out_by, checked_out_via, due_at, created_at")
    .is("returned_at", null)
    .order("due_at", { ascending: true })
    .limit(300);
  if (q) query = query.or(`title.ilike.%${q}%,student_email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    if (/checkouts|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ open: [], migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ open: data ?? [] });
});
