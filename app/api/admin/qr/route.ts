import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { guarded, requireAdmin } from "@/lib/guards";
import { canDo } from "@/lib/permissions";
import { unifiedUrl } from "@/lib/hosts";
import { normalizeCode, LIBRARY_CODE } from "@/lib/feedback-spots";

export const runtime = "nodejs";

/**
 * The QR image on a feedback poster, as SVG so it stays sharp at any print
 * size. The Sign Maker (assets/sign-maker.html) points an <img> here; the code
 * is turned into the absolute /hi/<code> URL server-side, so the poster can
 * never encode a link to somewhere else.
 *
 * Kept as a query parameter rather than a /…/qr.svg path on purpose: the
 * middleware matcher skips paths ending in .svg, which would put this behind
 * no auth wall at all.
 */
export const GET = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!canDo(admin, "signmaker")) {
    return NextResponse.json({ error: "You don't have permission for that." }, { status: 403 });
  }

  const code = normalizeCode(req.nextUrl.searchParams.get("spot") ?? "") || LIBRARY_CODE;
  // unifiedUrl() already carries the base path on a subpath deployment.
  const target = `${unifiedUrl()}/hi/${code}`;

  const svg = await QRCode.toString(target, {
    type: "svg",
    errorCorrectionLevel: "M", // posters are clean and close-range; M keeps it coarse
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
      "X-Feedback-Url": target, // handy when checking a poster before printing
    },
  });
});
