import { NextResponse } from "next/server";

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
        "Cache-Control": "private, max-age=86400",
      },
    });

  try {
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
}
