import { NextRequest, NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/guards";
import { canDo } from "@/lib/permissions";
import { unifiedUrl } from "@/lib/hosts";
import { listSpots } from "@/lib/feedback-spots";
import { loadSpotShelves } from "@/lib/feedback-store";

export const runtime = "nodejs";

/**
 * Everything a feedback poster can be printed for: the new website, the
 * library as a whole, then one entry per map zone. The Sign Maker fills its
 * zone picker from here, so the poster and the page a scan lands on are
 * always derived from the same shelves (lib/feedback-spots).
 */
export const GET = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!canDo(admin, "signmaker")) {
    return NextResponse.json({ error: "You don't have permission for that." }, { status: 403 });
  }

  const base = unifiedUrl();
  const spots = listSpots(await loadSpotShelves()).map((spot) => ({
    code: spot.code,
    label: spot.label,
    heading: spot.heading,
    topic: spot.topic,
    color: spot.color,
    category: spot.category,
    /** Printed under the QR for anyone whose camera won't cooperate. */
    url: `${base}/hi/${spot.code}`,
  }));

  return NextResponse.json({ spots }, { headers: { "Cache-Control": "private, no-store" } });
});
