"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startScanner, beep, type ScannerHandle } from "@/lib/scan";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import TagPicker, { TagPill } from "@/components/TagPicker";
import { Ic, Pin } from "@/components/icons";

type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  isbn10: string | null;
  copies: number;
  group_name: string | null;
  dedupe_key: string;
  tag: CategoryId | null;
};
type External = {
  title: string;
  creators: string | null;
  publisher: string | null;
  publish_date: string | null;
  isbn13: string | null;
  isbn10: string | null;
  cover: boolean;
};
type Lookup = { code: string; found: boolean; book?: Book; external?: External | null };
type ShelfHit = { id: string; label: string; shelf_number: string | null; letter_range: string | null };
type Suggestion = { tag: CategoryId; confidence: number; reasons: string[] };

const COOLDOWN_MS = 3000;

export default function ScanPanel({
  canImport,
  onCatalogChange,
  variant = "button",
}: {
  canImport: boolean;
  onCatalogChange?: () => void;
  /** "button": launcher + overlay (inventory page). "page": always-on scanner filling the Scan tab. */
  variant?: "button" | "page";
}) {
  const isPage = variant === "page";
  const [open, setOpen] = useState(isPage);
  const [mode, setMode] = useState<"lookup" | "bulk" | "putaway">("lookup");
  const [bulkTag, setBulkTag] = useState<CategoryId>("fiction");
  const [camError, setCamError] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string; undo?: () => Promise<void> } | null>(null);
  const [manual, setManual] = useState("");
  const [flash, setFlash] = useState(false);
  const [shelf, setShelf] = useState<ShelfHit | null>(null);
  // Put-away mode: the last scanned book and where it goes, kept on screen
  // until the next scan replaces it — cart, scan, shelve, repeat.
  const [putaway, setPutaway] = useState<{ title: string; shelf: ShelfHit | null; error?: string } | null>(null);

  // The put-away line: whenever a tagged catalog book is on the sheet,
  // resolve which shelf it belongs on and show it right there.
  useEffect(() => {
    setShelf(null);
    const book = result?.found ? result.book : null;
    if (!book?.tag) return;
    let stale = false;
    (async () => {
      const res = await fetch(`/api/admin/books/where?key=${encodeURIComponent(book.dedupe_key)}`);
      const data = await res.json().catch(() => null);
      if (!stale && data?.found && data.shelves?.length) setShelf(data.shelves[0]);
    })();
    return () => {
      stale = true;
    };
  }, [result]);

  // Untagged book on the sheet → offer a suggested tag with confidence.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  useEffect(() => {
    setSuggestion(null);
    const book = result?.found ? result.book : null;
    if (!book || book.tag || !canImport) return;
    let stale = false;
    (async () => {
      const res = await fetch(`/api/admin/books/suggest?key=${encodeURIComponent(book.dedupe_key)}`);
      const data = await res.json().catch(() => null);
      if (!stale && data?.suggestion) setSuggestion(data.suggestion);
    })();
    return () => {
      stale = true;
    };
  }, [result, canImport]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanner = useRef<ScannerHandle | null>(null);
  const lastSeen = useRef<Map<string, number>>(new Map());
  const pausedRef = useRef(false);
  const modeRef = useRef(mode);
  const bulkTagRef = useRef(bulkTag);
  modeRef.current = mode;
  bulkTagRef.current = bulkTag;

  const say = useCallback((ok: boolean, text: string, undo?: () => Promise<void>) => {
    setToast({ ok, text, undo });
    beep(ok);
    // undoable toasts linger longer so there's time to tap
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), undo ? 6000 : 2400);
  }, []);

  const lookup = useCallback(async (code: string): Promise<Lookup | null> => {
    const res = await fetch(`/api/admin/books/lookup?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const tagBook = useCallback(async (book_key: string, category: CategoryId | null): Promise<boolean> => {
    const res = await fetch("/api/admin/books/tag", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key, category }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToast({ ok: false, text: data.error ?? "Couldn't save the tag." });
      return false;
    }
    return true;
  }, []);

  const onCode = useCallback(
    async (raw: string) => {
      const code = raw.replace(/[^0-9Xx]/g, "");
      if (code.length !== 13 && code.length !== 10) return;
      if (pausedRef.current) return;
      const now = Date.now();
      const seen = lastSeen.current.get(code);
      if (seen && now - seen < COOLDOWN_MS) return;
      lastSeen.current.set(code, now);

      setFlash(true);
      setTimeout(() => setFlash(false), 350);

      if (modeRef.current === "lookup") {
        pausedRef.current = true;
        beep(true);
        const data = await lookup(code);
        if (!data) {
          pausedRef.current = false;
          say(false, "Lookup failed — try again.");
          return;
        }
        setResult(data);
      } else if (modeRef.current === "putaway") {
        // Put away: keep scanning; each book replaces the shelf callout.
        const data = await lookup(code);
        const book = data?.found ? data.book : null;
        if (!book) {
          beep(false);
          setPutaway({ title: data?.external?.title ?? code, shelf: null, error: "Not in the catalog" });
          return;
        }
        if (!book.tag) {
          beep(false);
          setPutaway({ title: book.title, shelf: null, error: "No tag yet — tag it first" });
          return;
        }
        const res = await fetch(`/api/admin/books/where?key=${encodeURIComponent(book.dedupe_key)}`);
        const whereData = await res.json().catch(() => null);
        if (whereData?.found && whereData.shelves?.length) {
          beep(true);
          setPutaway({ title: book.title, shelf: whereData.shelves[0] });
        } else {
          beep(false);
          setPutaway({ title: book.title, shelf: null, error: "No shelf matches its tag yet" });
        }
      } else {
        // Bulk tagging: every scanned catalog book gets the chosen tag.
        const data = await lookup(code);
        if (data?.found && data.book) {
          const previous = data.book.tag;
          const key = data.book.dedupe_key;
          const ok = await tagBook(key, bulkTagRef.current);
          if (ok)
            say(true, `${data.book.title} → ${CATEGORIES[bulkTagRef.current].label}`, async () => {
              await tagBook(key, previous);
              lastSeen.current.delete(code); // allow an immediate re-scan
              say(true, "Undone.");
            });
        } else {
          say(false, data?.external ? `Not in catalog: ${data.external.title}` : "Not in the catalog.");
        }
      }
    },
    [lookup, tagBook, say]
  );

  // Camera lifecycle follows the overlay
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCamError(null);
    (async () => {
      try {
        if (!videoRef.current) return;
        const handle = await startScanner(videoRef.current, onCode);
        if (cancelled) handle.stop();
        else scanner.current = handle;
      } catch {
        if (!cancelled) {
          setCamError("Camera unavailable — allow camera access, or type the ISBN below.");
        }
      }
    })();
    return () => {
      cancelled = true;
      scanner.current?.stop();
      scanner.current = null;
    };
  }, [open, onCode]);

  function close() {
    setOpen(false);
    setResult(null);
    setToast(null);
    pausedRef.current = false;
    lastSeen.current.clear();
  }

  function dismissResult() {
    setResult(null);
    pausedRef.current = false;
  }

  function switchMode(m: "lookup" | "bulk" | "putaway") {
    setMode(m);
    setResult(null);
    setPutaway(null);
    setToast(null);
    pausedRef.current = false;
    lastSeen.current.clear();
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.replace(/[^0-9Xx]/g, "");
    if (code.length !== 10 && code.length !== 13) {
      say(false, "Enter the 10- or 13-digit ISBN.");
      return;
    }
    setManual("");
    lastSeen.current.delete(code);
    pausedRef.current = false;
    await onCode(code);
  }

  async function setResultTag(tag: CategoryId | null) {
    if (!result?.book || busy) return;
    const previous = result.book.tag;
    const key = result.book.dedupe_key;
    setBusy(true);
    const ok = await tagBook(key, tag);
    if (ok) {
      setResult({ ...result, book: { ...result.book, tag } });
      say(true, tag ? `Tagged ${CATEGORIES[tag].label}` : "Tag cleared", async () => {
        if (await tagBook(key, previous)) {
          setResult((cur) =>
            cur?.book && cur.book.dedupe_key === key ? { ...cur, book: { ...cur.book, tag: previous } } : cur
          );
          say(true, "Undone.");
        }
      });
    }
    setBusy(false);
  }

  async function adjustCopies(delta: 1 | -1) {
    if (!result?.book || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/books/${result.book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say(false, data.error ?? "Couldn't update copies.");
    } else if (data.removed) {
      const gone = result.book;
      say(true, "Removed from the catalog.", async () => {
        const back = await fetch("/api/admin/books/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: gone.title,
            creators: gone.creators,
            isbn13: gone.isbn13,
            isbn10: gone.isbn10,
          }),
        });
        const restored = await back.json().catch(() => ({}));
        if (back.ok && restored.book) {
          pausedRef.current = true;
          setResult({ code: gone.isbn13 ?? gone.isbn10 ?? "", found: true, book: restored.book });
          say(true, "Restored.");
          onCatalogChange?.();
        }
      });
      dismissResult();
      onCatalogChange?.();
    } else {
      const bookId = data.book.id;
      setResult({ ...result, book: data.book });
      say(true, delta > 0 ? "Copy added." : "Copy removed.", async () => {
        const rev = await fetch(`/api/admin/books/${bookId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta: -delta }),
        });
        const revData = await rev.json().catch(() => ({}));
        if (rev.ok && revData.book) {
          setResult((cur) =>
            cur && cur.book && cur.book.id === bookId ? { ...cur, book: revData.book as Book } : cur
          );
          say(true, "Undone.");
          onCatalogChange?.();
        }
      });
      onCatalogChange?.();
    }
    setBusy(false);
  }

  async function addExternal() {
    if (!result?.external || busy) return;
    setBusy(true);
    const res = await fetch("/api/admin/books/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.external),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) say(false, data.error ?? "Couldn't add the book.");
    else {
      const ext = result.external;
      const code = result.code;
      setResult({ code, found: true, book: data.book });
      say(true, "Added to the catalog.", async () => {
        const rev = await fetch(`/api/admin/books/${data.book.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta: -1 }),
        });
        if (rev.ok) {
          setResult({ code, found: false, external: ext });
          say(true, "Undone — not added.");
          onCatalogChange?.();
        }
      });
      onCatalogChange?.();
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="btn brand scan-launch" onClick={() => setOpen(true)}>
        <Ic name="camera" size={16} /> Scan barcodes
      </button>
    );
  }

  const isbnFor = result?.book?.isbn13 ?? result?.book?.isbn10 ?? result?.external?.isbn13 ?? result?.code;

  return (
    <div
      className={`scan-overlay${isPage ? " page" : ""}${mode !== "lookup" ? " bulk" : ""}`}
      role={isPage ? undefined : "dialog"}
      aria-label="Barcode scanner"
    >
      <div className={`scan-stage${flash ? " flash" : ""}`}>
        <video ref={videoRef} className="scan-video" muted playsInline />
        <div className="scan-guide" aria-hidden />
        {camError && <div className="scan-camerror">{camError}</div>}

        <div className="scan-top">
          <div className="scan-modes">
            <button className={`scan-mode${mode === "lookup" ? " on" : ""}`} onClick={() => switchMode("lookup")}>
              Look up
            </button>
            <button className={`scan-mode${mode === "putaway" ? " on" : ""}`} onClick={() => switchMode("putaway")}>
              Put away
            </button>
            {canImport && (
              <button className={`scan-mode${mode === "bulk" ? " on" : ""}`} onClick={() => switchMode("bulk")}>
                Bulk tag
              </button>
            )}
          </div>
          {!isPage ? (
            <button className="scan-close" onClick={close} aria-label="Close scanner">
              ✕
            </button>
          ) : (
            // Unlinked on desktop, but a typed URL shouldn't be a trap
            <a className="scan-close desk-only" href="/admin" aria-label="Leave scanner">
              ✕
            </a>
          )}
        </div>

        {mode === "bulk" && (
          <div className="scan-bulkbar">
            <span className="scan-bulkhint">Every scan tags the book:</span>
            <TagPicker value={bulkTag} onChange={(t) => t && setBulkTag(t)} />
          </div>
        )}

        {mode === "putaway" && (
          <div className="scan-putaway">
            {putaway ? (
              putaway.shelf ? (
                <>
                  <div className="pa-book">{putaway.title}</div>
                  <div className="pa-shelf">
                    {putaway.shelf.shelf_number ? `Shelf ${putaway.shelf.shelf_number}` : putaway.shelf.label}
                  </div>
                  <div className="pa-sub">
                    {putaway.shelf.shelf_number ? putaway.shelf.label : ""}
                    {putaway.shelf.letter_range ? ` · ${putaway.shelf.letter_range}` : ""}
                  </div>
                  <a className="pa-map" href={`/admin/map?shelf=${putaway.shelf.id}`}>
                    Show on map →
                  </a>
                </>
              ) : (
                <>
                  <div className="pa-book">{putaway.title}</div>
                  <div className="pa-err">{putaway.error}</div>
                </>
              )
            ) : (
              <div className="pa-hint">Scan a book to see which shelf it goes on</div>
            )}
          </div>
        )}

        {toast && (
          <div className={`scan-toast ${toast.ok ? "ok" : "bad"}`}>
            {toast.text}
            {toast.undo && (
              <button
                type="button"
                className="toast-undo"
                onClick={async () => {
                  const u = toast.undo!;
                  setToast(null);
                  await u();
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}

        <form className="scan-manual" onSubmit={submitManual}>
          <input
            className="input"
            inputMode="numeric"
            placeholder="…or type the ISBN"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="btn" type="submit">
            Go
          </button>
        </form>
      </div>

      {result && mode === "lookup" && (
        <div className="scan-sheet">
          {result.found && result.book ? (
            <>
              <div className="scan-bookrow">
                {isbnFor && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="scan-cover"
                    src={`/api/admin/books/cover?isbn=${isbnFor}`}
                    alt=""
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
                <div>
                  <div className="scan-title">
                    {result.book.title} {result.book.tag && <TagPill tag={result.book.tag} small />}
                  </div>
                  <div className="scan-meta">
                    {result.book.creators ?? "Unknown author"} · {result.book.copies}{" "}
                    {result.book.copies === 1 ? "copy" : "copies"}
                    {result.book.group_name ? ` · ${result.book.group_name}` : ""}
                  </div>
                  <div className="scan-meta ok">✓ In the catalog</div>
                  {shelf && (
                    <a className="scan-shelf" href={`/admin/map?shelf=${shelf.id}`}>
                      <Pin size={13} /> {shelf.shelf_number ? `Shelf ${shelf.shelf_number} · ` : ""}
                      {shelf.label}
                      {shelf.letter_range ? ` (${shelf.letter_range})` : ""} →
                    </a>
                  )}
                </div>
              </div>
              {canImport && (
                <>
                  <TagPicker
                    value={result.book.tag}
                    onChange={setResultTag}
                    disabled={busy}
                    suggested={suggestion?.tag ?? null}
                  />
                  <div className="scan-actions">
                    <button className="btn" disabled={busy} onClick={() => adjustCopies(1)}>
                      + Add copy
                    </button>
                    <button className="btn" disabled={busy} onClick={() => adjustCopies(-1)}>
                      − Remove {result.book.copies === 1 ? "(last copy!)" : "copy"}
                    </button>
                    <button className="btn primary" onClick={dismissResult}>
                      Done
                    </button>
                  </div>
                </>
              )}
              {!canImport && (
                <div className="scan-actions">
                  <button className="btn primary" onClick={dismissResult}>
                    Done
                  </button>
                </div>
              )}
            </>
          ) : result.external ? (
            <>
              <div className="scan-bookrow">
                {result.external.cover && isbnFor && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="scan-cover"
                    src={`/api/admin/books/cover?isbn=${isbnFor}`}
                    alt=""
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
                <div>
                  <div className="scan-title">{result.external.title}</div>
                  <div className="scan-meta">
                    {result.external.creators ?? "Unknown author"}
                    {result.external.publisher ? ` · ${result.external.publisher}` : ""}
                    {result.external.publish_date ? ` · ${result.external.publish_date}` : ""}
                  </div>
                  <div className="scan-meta warn">Not in the catalog</div>
                </div>
              </div>
              <div className="scan-actions">
                {canImport && (
                  <button className="btn brand" disabled={busy} onClick={addExternal}>
                    + Add to catalog
                  </button>
                )}
                <button className="btn primary" onClick={dismissResult}>
                  {canImport ? "Skip" : "Done"}
                </button>
              </div>
              {canImport && (
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  Also add it in Libib — the weekly CSV import replaces this catalog.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="scan-title">No match for {result.code}</div>
              <p className="hint" style={{ margin: "6px 0 10px" }}>
                Not in the catalog, and no book found for that number. Check the ISBN under the
                barcode, or add the book in Libib.
              </p>
              <div className="scan-actions">
                <button className="btn primary" onClick={dismissResult}>
                  Keep scanning
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
