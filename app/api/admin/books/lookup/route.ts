import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { attachTags } from "@/lib/tags";
import { gbVolumesByIsbn } from "@/lib/googlebooks";

export type ExternalBook = {
  title: string;
  creators: string | null;
  publisher: string | null;
  publish_date: string | null;
  isbn13: string | null;
  isbn10: string | null;
  cover: boolean;
};

/** Normalize a scanned barcode / typed ISBN to bare digits (X allowed for ISBN-10). */
function cleanCode(raw: string): string | null {
  const d = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return d.length === 10 || d.length === 13 ? d : null;
}

/** Open Library: keyless, library-friendly, one call for full metadata. */
async function openLibrary(code: string): Promise<ExternalBook | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${code}&jscmd=data&format=json`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "LangLibraryPortal/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.[`ISBN:${code}`];
    if (!v?.title) return null;
    const ids = v.identifiers ?? {};
    return {
      title: String(v.title).slice(0, 500),
      creators: v.authors?.length
        ? v.authors.map((a: { name: string }) => a.name).join(", ").slice(0, 500)
        : null,
      publisher: v.publishers?.length ? String(v.publishers[0].name).slice(0, 300) : null,
      publish_date: v.publish_date ? String(v.publish_date).slice(0, 50) : null,
      isbn13: ids.isbn_13?.[0] ?? (code.length === 13 ? code : null),
      isbn10: ids.isbn_10?.[0] ?? (code.length === 10 ? code : null),
      cover: Boolean(v.cover),
    };
  } catch {
    return null;
  }
}

/** Google Books fallback — keyless quota is small, so it goes second. */
async function googleBooks(code: string): Promise<ExternalBook | null> {
  try {
    const res = await fetch(gbVolumesByIsbn(code), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.items?.[0]?.volumeInfo;
    if (!v?.title) return null;
    const ids: { type: string; identifier: string }[] = v.industryIdentifiers ?? [];
    const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier ?? (code.length === 13 ? code : null);
    const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier ?? (code.length === 10 ? code : null);
    return {
      title: String(v.title).slice(0, 500),
      creators: v.authors?.length ? v.authors.join(", ").slice(0, 500) : null,
      publisher: v.publisher ? String(v.publisher).slice(0, 300) : null,
      publish_date: v.publishedDate ? String(v.publishedDate).slice(0, 50) : null,
      isbn13,
      isbn10,
      cover: Boolean(v.imageLinks?.thumbnail),
    };
  } catch {
    return null; // offline / timeout — the scan flow still works without metadata
  }
}

/**
 * Look a scanned code up: the active inventory first (exact ISBN match),
 * then Google Books for titles the library doesn't have yet.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "inventory_view");
  const code = cleanCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "That doesn't look like an ISBN barcode." }, { status: 400 });

  const { data: active } = await db()
    .from("inventory_syncs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  let book = null;
  if (active) {
    const { data } = await db()
      .from("books")
      .select("id, title, creators, isbn13, isbn10, copies, group_name, dedupe_key")
      .eq("sync_id", active.id)
      .or(`isbn13.eq.${code},isbn10.eq.${code}`)
      .limit(1)
      .maybeSingle();
    if (data) [book] = await attachTags([data]);
  }

  if (book) return NextResponse.json({ found: true, book, code });

  const external = (await openLibrary(code)) ?? (await googleBooks(code));
  return NextResponse.json({ found: false, external, code });
});
