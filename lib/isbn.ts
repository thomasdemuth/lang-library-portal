/**
 * ISBN-10 ⇄ ISBN-13 conversion. The barcode printed on a book's back cover is
 * always the 978/979 Bookland EAN-13, but plenty of catalog rows carry only
 * the ISBN-10 from the copyright page — so a scan has to be matched against
 * both forms or the book reads as "not in the catalog" and gets added twice.
 * Pure functions, no dependencies: shared by the lookup/add routes and tested
 * in isolation.
 */

/** Bare ISBN characters: digits, plus X for the ISBN-10 check digit. */
function clean(raw: string): string {
  return String(raw ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** ISBN-10 check character over the 9-digit body ("X" stands for 10). */
function check10(body: string): string | null {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = body.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return null;
    sum += d * (10 - i);
  }
  const rest = (11 - (sum % 11)) % 11;
  return rest === 10 ? "X" : String(rest);
}

/** EAN-13 check digit over the 12-digit body. */
function check13(body: string): string | null {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = body.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return null;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidIsbn10(raw: string): boolean {
  const s = clean(raw);
  if (s.length !== 10 || s.slice(0, 9).includes("X")) return false;
  return check10(s) === s[9];
}

export function isValidIsbn13(raw: string): boolean {
  const s = clean(raw);
  if (!/^[0-9]{13}$/.test(s)) return false;
  return check13(s) === s[12];
}

/** ISBN-10 → ISBN-13 (always a 978 prefix). Null when the input is invalid. */
export function isbn10to13(raw: string): string | null {
  const s = clean(raw);
  if (!isValidIsbn10(s)) return null;
  const body = `978${s.slice(0, 9)}`;
  const c = check13(body);
  return c === null ? null : body + c;
}

/**
 * ISBN-13 → ISBN-10. Only 978-prefixed ISBN-13s have an ISBN-10 counterpart;
 * the 979 block was never allocated in ISBN-10 space, so those return null.
 */
export function isbn13to10(raw: string): string | null {
  const s = clean(raw);
  if (!isValidIsbn13(s) || !s.startsWith("978")) return null;
  const body = s.slice(3, 12);
  const c = check10(body);
  return c === null ? null : body + c;
}

/**
 * UPC-A (12 digits) → EAN-13 by zero-padding. The check digit survives the
 * pad — EAN-13 weights the padded digits exactly as UPC-A weighted them — so
 * the result is validated as an EAN-13 and null means "not a real UPC-A".
 */
export function upcAToEan13(raw: string): string | null {
  const s = clean(raw);
  if (!/^[0-9]{12}$/.test(s)) return null;
  const padded = `0${s}`;
  return isValidIsbn13(padded) ? padded : null;
}

export type IsbnForms = { isbn13?: string; isbn10?: string };

/**
 * Both forms of a scanned or typed ISBN, with recomputed check digits.
 * Null when the code isn't a checksum-valid ISBN: a 13-digit EAN outside the
 * 978/979 Bookland range is a product barcode, not a book, and says so.
 */
export function normalizeIsbn(raw: string): IsbnForms | null {
  const s = clean(raw);
  if (s.length === 10) {
    if (!isValidIsbn10(s)) return null;
    const i13 = isbn10to13(s);
    return i13 ? { isbn13: i13, isbn10: s } : { isbn10: s };
  }
  if (s.length === 13) {
    if (!isValidIsbn13(s)) return null;
    if (!s.startsWith("978") && !s.startsWith("979")) return null;
    const i10 = isbn13to10(s);
    return i10 ? { isbn13: s, isbn10: i10 } : { isbn13: s };
  }
  return null;
}

/**
 * Every catalog spelling a scanned code could be filed under: the code
 * itself, its converted counterpart, and the EAN-13/UPC-A pair. Output is
 * `[0-9X]`-only, so it is safe to embed in a PostgREST `.or()` filter.
 */
export function isbnCandidates(raw: string): string[] {
  const s = clean(raw);
  const out = new Set<string>();
  if (s) out.add(s);
  const forms = normalizeIsbn(s);
  if (forms?.isbn13) out.add(forms.isbn13);
  if (forms?.isbn10) out.add(forms.isbn10);
  const padded = upcAToEan13(s);
  if (padded) out.add(padded);
  if (/^0[0-9]{12}$/.test(s)) out.add(s.slice(1));
  return [...out].filter((c) => /^[0-9X]+$/.test(c));
}
