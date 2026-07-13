import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireChief } from "@/lib/guards";

/** The admin roster — Chief only, since only Chiefs manage admins. */
export const GET = guarded(async (req: NextRequest) => {
  await requireChief(req);
  const full = "id, username, email, name, created_at, last_login_at, disabled_at, notify_requests, role, permissions";
  // Self-deleted accounts (deleted_at set) are gone for good from this roster,
  // unlike a Chief-initiated disable, which stays visible so it can be undone.
  let { data, error } = await db()
    .from("admins")
    .select(full)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error && /role|permissions|deleted_at|column/i.test(error.message ?? "")) {
    const retry = await db()
      .from("admins")
      .select("id, username, email, name, created_at, last_login_at, disabled_at, notify_requests")
      .order("created_at", { ascending: true });
    data = (retry.data ?? []).map((a) => ({ ...a, role: "chief", permissions: {} }));
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ admins: data });
});
