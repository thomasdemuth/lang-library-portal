import { NextResponse } from "next/server";
import { gbVolumesByIsbn } from "@/lib/googlebooks";

// A cover is keyed by ISBN and never changes, so hits are cached forever and
// misses long enough to stop every card re-asking the upstreams all day.
const HIT_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";
const MISS_CACHE = "public, max-age=86400, s-maxage=86400";
const UPSTREAM_TIMEOUT = 2500;

/**
 * Stream a book-cover thumbnail by ISBN (Open Library first, Google
 * Books fallback) so covers render under the strict CSP (img-src 'self').
 */
export async function coverResponse(rawIsbn: string): Promise<NextResponse> {
  const isbn = rawIsbn.replace(/[^0-9Xx]/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) return new NextResponse(null, { status: 400 });

  const stream = (img: Response) =>
    new NextResponse(img.body, {
      headers: {
        "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": HIT_CACHE,
      },
    });
  const noCover = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": MISS_CACHE } });

  try {
    const ol = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });
    if (ol.ok && ol.body) return stream(ol);

    const meta = await fetch(gbVolumesByIsbn(isbn), { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) }).then((r) =>
      r.ok ? r.json() : null
    );
    const url: string | undefined = meta?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
    if (!url) return noCover();

    const img = await fetch(url.replace(/^http:/, "https:"), { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) });
    if (!img.ok || !img.body) return noCover();
    return stream(img);
  } catch {
    return noCover();
  }
}
