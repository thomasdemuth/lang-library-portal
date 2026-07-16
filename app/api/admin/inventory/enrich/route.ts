import { NextRequest, NextResponse } from "next/server";
import { guarded, requirePermission } from "@/lib/guards";
import { enrichProgress } from "@/lib/enrich";

/**
 * Enrichment progress for the inventory status line. The actual work is
 * automated — a nightly cron drips through missing descriptions/covers
 * from Open Library & Google Books (see lib/enrich.ts).
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  return NextResponse.json(await enrichProgress());
});
