import { NextRequest, NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/guards";

export const GET = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  return NextResponse.json({
    id: admin.id,
    username: admin.username,
    email: admin.email,
    name: admin.name,
    notify_requests: admin.notify_requests,
  });
});
