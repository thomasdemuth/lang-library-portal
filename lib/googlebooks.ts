/**
 * Google Books "volumes by ISBN" endpoint. When GOOGLE_BOOKS_API_KEY is set
 * the key is appended, which raises the daily quota well above the keyless
 * limit (used by the cover proxy, scan lookup, auto-tagger, and the nightly
 * enrichment drip).
 */
export function gbVolumesByIsbn(isbn: string): string {
  const base = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&country=US`;
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  return key ? `${base}&key=${encodeURIComponent(key)}` : base;
}
