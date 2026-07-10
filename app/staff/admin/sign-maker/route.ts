import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { guarded, requireAdmin } from "@/lib/guards";

/**
 * Streams the sign maker verbatim, admin-only. The file is intentionally NOT
 * in public/ so there is no unauthenticated path to it; the middleware guards
 * this URL and we re-check here.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const file = await readFile(path.join(process.cwd(), "assets", "sign-maker.html"));
  return new NextResponse(file, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      // The sign maker is a self-contained page with inline scripts/styles and
      // a Google Fonts link; give this one response a matching relaxed CSP.
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:",
    },
  });
});
