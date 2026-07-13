import { NextRequest, NextResponse } from "next/server";
import { guarded, requirePermission } from "@/lib/guards";

/**
 * Proxy a book-cover thumbnail so it can render under the strict CSP
 * (img-src 'self'). Google Books serves covers by ISBN without a key.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const isbn = (req.nextUrl.searchParams.get("isbn") ?? "").replace(/[^0-9Xx]/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) return new NextResponse(null, { status: 400 });

  const stream = (img: Response) =>
    new NextResponse(img.body, {
      headers: {
        "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });

  try {
    // Open Library first: direct by ISBN, keyless, no quota drama.
    const ol = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`, {
      signal: AbortSignal.timeout(5000),
    });
    if (ol.ok && ol.body) return stream(ol);

    const meta = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&country=US`,
      { signal: AbortSignal.timeout(5000) }
    ).then((r) => (r.ok ? r.json() : null));
    const url: string | undefined = meta?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
    if (!url) return new NextResponse(null, { status: 404 });

    const img = await fetch(url.replace(/^http:/, "https:"), { signal: AbortSignal.timeout(5000) });
    if (!img.ok || !img.body) return new NextResponse(null, { status: 404 });
    return stream(img);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
});
