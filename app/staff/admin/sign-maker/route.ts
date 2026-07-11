import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { guarded, requireAdmin } from "@/lib/guards";

/**
 * Streams the sign maker verbatim, admin-only. The file is intentionally NOT
 * in public/ so there is no unauthenticated path to it; the middleware guards
 * this URL and we re-check here.
 */
/** A floating "back to Management" link, injected so the standalone file stays pristine. Hidden when printing. */
const BACK_LINK = `
<style>@media print{#adminBack{display:none!important}}</style>
<a id="adminBack" href="/admin" style="position:fixed;top:12px;right:14px;z-index:99999;background:#1c2330;color:#fff;text-decoration:none;font:700 13px/1 Montserrat,-apple-system,Arial,sans-serif;padding:10px 14px;border-radius:9px;box-shadow:0 2px 10px rgba(16,24,40,.22)">← Management</a>
</body>`;

export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const raw = await readFile(path.join(process.cwd(), "assets", "sign-maker.html"), "utf8");
  const file = raw.includes("</body>") ? raw.replace("</body>", BACK_LINK) : raw + BACK_LINK;
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
