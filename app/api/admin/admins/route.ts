import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const { data, error } = await db()
    .from("admins")
    .select("id, username, email, name, created_at, last_login_at, disabled_at, notify_requests")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ admins: data });
});
