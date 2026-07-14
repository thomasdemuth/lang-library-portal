import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { coverResponse } from "@/lib/covers";

/** Cover proxy for students & teachers (read-only). */
export const GET = guarded(async (req: NextRequest): Promise<NextResponse> => {
  await requireSession(req);
  return coverResponse(req.nextUrl.searchParams.get("isbn") ?? "");
});
