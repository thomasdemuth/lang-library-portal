import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";

/**
 * Who has this book out right now — the desk's answer after a scan, so a
 * check-in knows which borrower to close. Staff and management only.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireStaff(req);
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await db()
    .from("checkouts")
    .select("id, student_email, checked_out_by, checked_out_via, due_at, created_at")
    .eq("book_key", key)
    .is("returned_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    if (/checkouts|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ open: [], migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ open: data ?? [] });
});
