"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startScanner, beep, type ScannerHandle } from "@/lib/scan";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import TagPicker, { TagPill } from "@/components/TagPicker";

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

const COOLDOWN_MS = 3000;

export default function ScanPanel({
  canImport,
  onCatalogChange,
}: {
  canImport: boolean;
  onCatalogChange?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"lookup" | "bulk">("lookup");
  const [bulkTag, setBulkTag] = useState<CategoryId>("fiction");
  const [camError, setCamError] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState("");
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanner = useRef<ScannerHandle | null>(null);
  const lastSeen = useRef<Map<string, number>>(new Map());
  const pausedRef = useRef(false);
  const modeRef = useRef(mode);
  const bulkTagRef = useRef(bulkTag);
  modeRef.current = mode;
  bulkTagRef.current = bulkTag;

  const say = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    beep(ok);
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2400);
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
      } else {
        // Bulk tagging: every scanned catalog book gets the chosen tag.
        const data = await lookup(code);
        if (data?.found && data.book) {
          const ok = await tagBook(data.book.dedupe_key, bulkTagRef.current);
          if (ok) say(true, `${data.book.title} → ${CATEGORIES[bulkTagRef.current].label}`);
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
    setBusy(true);
    const ok = await tagBook(result.book.dedupe_key, tag);
    if (ok) {
      setResult({ ...result, book: { ...result.book, tag } });
      say(true, tag ? `Tagged ${CATEGORIES[tag].label}` : "Tag cleared");
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
      say(true, "Removed from the catalog.");
      dismissResult();
      onCatalogChange?.();
    } else {
      setResult({ ...result, book: data.book });
      say(true, delta > 0 ? "Copy added." : "Copy removed.");
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
      setResult({ code: result.code, found: true, book: data.book });
      say(true, "Added to the catalog.");
      onCatalogChange?.();
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="btn brand" onClick={() => setOpen(true)}>
        📷 Scan barcodes
      </button>
    );
  }

  const isbnFor = result?.book?.isbn13 ?? result?.book?.isbn10 ?? result?.external?.isbn13 ?? result?.code;

  return (
    <div className="scan-overlay" role="dialog" aria-label="Barcode scanner">
      <div className={`scan-stage${flash ? " flash" : ""}`}>
        <video ref={videoRef} className="scan-video" muted playsInline />
        <div className="scan-guide" aria-hidden />
        {camError && <div className="scan-camerror">{camError}</div>}

        <div className="scan-top">
          <div className="scan-modes">
            <button className={`scan-mode${mode === "lookup" ? " on" : ""}`} onClick={() => setMode("lookup")}>
              Look up
            </button>
            {canImport && (
              <button className={`scan-mode${mode === "bulk" ? " on" : ""}`} onClick={() => setMode("bulk")}>
                Bulk tag
              </button>
            )}
          </div>
          <button className="scan-close" onClick={close} aria-label="Close scanner">
            ✕
          </button>
        </div>

        {mode === "bulk" && (
          <div className="scan-bulkbar">
            <span className="scan-bulkhint">Every scan tags the book:</span>
            <TagPicker value={bulkTag} onChange={(t) => t && setBulkTag(t)} />
          </div>
        )}

        {toast && <div className={`scan-toast ${toast.ok ? "ok" : "bad"}`}>{toast.text}</div>}

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
                </div>
              </div>
              {canImport && (
                <>
                  <TagPicker value={result.book.tag} onChange={setResultTag} disabled={busy} />
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
