import { NextResponse } from "next/server";

/**
 * The running deployment's identity. Clients poll this and offer a
 * refresh when it changes (Vercel bakes the commit SHA into each deploy).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
