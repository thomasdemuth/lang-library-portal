import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";

/** A teacher's own requests, newest first. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireStaff(req);
  const { data, error } = await db()
    .from("book_requests")
    // admin_note reaches the teacher by email on ready/declined; showing it in
    // their own list means they don't have to go digging through their inbox.
    .select(
      "id, title, author, copies_requested, needed_by, notes, match_status, matched_title, matched_copies, status, admin_note, created_at, status_updated_at"
    )
    .eq("requester_email", session.email)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ requests: data });
});
