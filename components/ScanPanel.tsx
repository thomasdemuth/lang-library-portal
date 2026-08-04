"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startScanner, beep, type ScannerHandle } from "@/lib/scan";
import { announce } from "@/components/Announcer";
import { upcAToEan13 } from "@/lib/isbn";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import TagPicker, { TagPill } from "@/components/TagPicker";
import { Ic, Pin } from "@/components/icons";
import { withBase } from "@/lib/base";

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
/** A shelf answer plus how it was reached: `ranged` = narrowed by letter range. */
type WhereHit = { ranged: boolean; tag: CategoryId; shelves: ShelfHit[] };
type Suggestion = { tag: CategoryId; confidence: number; reasons: string[] };
/** One tag applied during a bulk stint, with the tag it replaced. */
type BulkEntry = { key: string; previous: CategoryId | null };

const COOLDOWN_MS = 3000;
/** Above this many tags, "Undo session" asks first. */
const CONFIRM_UNDO_OVER = 10;

/**
 * The shelf callout. Without a letter-range match the resolver only knows the
 * category, so the line says exactly that instead of naming a shelf the book
 * may well not be on.
 */
function ShelfLine({ where }: { where: WhereHit }) {
  const confident = where.ranged ? where.shelves[0] : null;
  const target = confident ?? (where.shelves.length === 1 ? where.shelves[0] : null);
  const text = confident
    ? `${confident.shelf_number ? `Shelf ${confident.shelf_number} · ` : ""}${confident.label}${
        confident.letter_range ? ` (${confident.letter_range})` : ""
      }`
    : `Somewhere in ${CATEGORIES[where.tag].label} — no letter range set`;
  return target ? (
    <a className="scan-shelf" href={withBase(`/admin/map?shelf=${target.id}`)}>
      <Pin size={13} /> {text} →
    </a>
  ) : (
    <span className="scan-shelf">
      <Pin size={13} /> {text}
    </span>
  );
}

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
  // Null until this bulk stint is told which category — never inherited from
  // a previous stint, so nothing gets tagged from a category nobody chose.
  const [bulkTag, setBulkTag] = useState<CategoryId | null>(null);
  const [bulkSession, setBulkSession] = useState<BulkEntry[]>([]);
  const [undoingBulk, setUndoingBulk] = useState<number | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string; undo?: () => Promise<void> } | null>(null);
  const [manual, setManual] = useState("");
  const [flash, setFlash] = useState(false);
  const [where, setWhere] = useState<WhereHit | null>(null);
  // Put-away mode: the last scanned book and where it goes, kept on screen
  // until the next scan replaces it — cart, scan, shelve, repeat.
  const [putaway, setPutaway] = useState<{ title: string; where: WhereHit | null; error?: string } | null>(null);

  // The put-away line: whenever a tagged catalog book is on the sheet,
  // resolve which shelf it belongs on and show it right there.
  useEffect(() => {
    setWhere(null);
    const book = result?.found ? result.book : null;
    if (!book?.tag) return;
    let stale = false;
    (async () => {
      const res = await fetch(withBase(`/api/admin/books/where?key=${encodeURIComponent(book.dedupe_key)}`));
      const data = await res.json().catch(() => null);
      if (!stale && data?.found && data.shelves?.length) {
        setWhere({ ranged: Boolean(data.ranged), tag: data.tag, shelves: data.shelves });
      }
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
      const res = await fetch(withBase(`/api/admin/books/suggest?key=${encodeURIComponent(book.dedupe_key)}`));
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
    // The toast is a plain div and the other half of the feedback is a beep,
    // so without this a scan is silent to a screen reader. Failures interrupt.
    announce(text, !ok);
    beep(ok);
    // undoable toasts linger longer so there's time to tap
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), undo ? 6000 : 2400);
  }, []);

  const lookup = useCallback(async (code: string): Promise<Lookup | null> => {
    const res = await fetch(withBase(`/api/admin/books/lookup?code=${encodeURIComponent(code)}`));
    if (!res.ok) return null;
    return res.json();
  }, []);

  const tagBook = useCallback(async (book_key: string, category: CategoryId | null): Promise<boolean> => {
    const res = await fetch(withBase("/api/admin/books/tag"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key, category }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Through say(), not a bare setToast: that one had no dismissal timer,
      // so a failed tag save sat on the camera until some later toast
      // replaced it — and it never made the failure sound.
      say(false, data.error ?? "Couldn't save the tag.");
      return false;
    }
    return true;
  }, [say]);

  const onCode = useCallback(
    async (raw: string) => {
      if (pausedRef.current) return;
      const now = Date.now();
      const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
      if (!cleaned) return;
      // UPC-A is one of the two formats the decoder is configured to read, so
      // pad it into an EAN-13 rather than dropping it. Anything else that
      // isn't an ISBN length says so — silence reads as a broken scanner.
      const code = cleaned.length === 12 ? upcAToEan13(cleaned) : cleaned;
      if (!code || (code.length !== 10 && code.length !== 13)) {
        const shouted = lastSeen.current.get(cleaned);
        if (!shouted || now - shouted >= COOLDOWN_MS) {
          lastSeen.current.set(cleaned, now);
          say(false, "That barcode isn't an ISBN.");
        }
        return;
      }
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
        announce(
          data.found && data.book
            ? `${data.book.title} — in the catalog, ${data.book.copies} ${data.book.copies === 1 ? "copy" : "copies"}.`
            : data.external
              ? `${data.external.title} — not in the catalog.`
              : `No match for ${code}.`
        );
      } else if (modeRef.current === "putaway") {
        // Put away: keep scanning; each book replaces the shelf callout.
        const data = await lookup(code);
        const book = data?.found ? data.book : null;
        if (!book) {
          beep(false);
          const title = data?.external?.title ?? code;
          setPutaway({ title, where: null, error: "Not in the catalog" });
          announce(`${title} — not in the catalog.`, true);
          return;
        }
        if (!book.tag) {
          beep(false);
          setPutaway({ title: book.title, where: null, error: "No tag yet — tag it first" });
          announce(`${book.title} — no tag yet, tag it first.`, true);
          return;
        }
        const res = await fetch(withBase(`/api/admin/books/where?key=${encodeURIComponent(book.dedupe_key)}`));
        const whereData = await res.json().catch(() => null);
        if (whereData?.found && whereData.shelves?.length) {
          // A category-only match is a hint, not an answer — beep it as one.
          beep(Boolean(whereData.ranged));
          setPutaway({
            title: book.title,
            where: { ranged: Boolean(whereData.ranged), tag: whereData.tag, shelves: whereData.shelves },
          });
          const top = whereData.shelves[0];
          announce(
            whereData.ranged
              ? `${book.title} — ${top.shelf_number ? `shelf ${top.shelf_number}, ` : ""}${top.label}${top.letter_range ? `, ${top.letter_range}` : ""}.`
              : `${book.title} — somewhere in ${CATEGORIES[whereData.tag as CategoryId].label}, no letter range set.`
          );
        } else {
          beep(false);
          setPutaway({ title: book.title, where: null, error: "No shelf matches its tag yet" });
          announce(`${book.title} — no shelf matches its tag yet.`, true);
        }
      } else {
        // Bulk tagging: every scanned catalog book gets the chosen tag.
        const tag = bulkTagRef.current;
        if (!tag) {
          say(false, "Pick a category first.");
          return;
        }
        const data = await lookup(code);
        if (data?.found && data.book) {
          const previous = data.book.tag;
          const key = data.book.dedupe_key;
          const ok = await tagBook(key, tag);
          if (ok) {
            setBulkSession((s) => [...s, { key, previous }]);
            say(true, `${data.book.title} → ${CATEGORIES[tag].label}`, async () => {
              await tagBook(key, previous);
              setBulkSession((s) => {
                const at = s.findLastIndex((e) => e.key === key);
                return at < 0 ? s : [...s.slice(0, at), ...s.slice(at + 1)];
              });
              lastSeen.current.delete(code); // allow an immediate re-scan
              say(true, "Undone.");
            });
          }
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

  // Closing ends the bulk session: the panel stays mounted behind the
  // launcher, so without this the next open would inherit a category nobody
  // chose this time round, and an "Undo session" that spans two sittings.
  function endBulkSession() {
    setBulkTag(null);
    setBulkSession([]);
    setUndoingBulk(null);
  }

  function close() {
    setOpen(false);
    setResult(null);
    setPutaway(null); // a stale shelf callout must not greet the next session
    setToast(null);
    endBulkSession();
    pausedRef.current = false;
    lastSeen.current.clear();
  }

  function dismissResult() {
    setResult(null);
    pausedRef.current = false;
  }

  function switchMode(m: "lookup" | "bulk" | "putaway") {
    setResult(null);
    setPutaway(null);
    setToast(null);
    pausedRef.current = false;
    lastSeen.current.clear();
    if (m === mode) return;
    setMode(m);
    endBulkSession();
  }

  /** Put every tag this bulk session applied back the way it was found. */
  async function undoBulkSession() {
    if (undoingBulk !== null || bulkSession.length === 0) return;
    const entries = [...bulkSession].reverse();
    if (
      entries.length > CONFIRM_UNDO_OVER &&
      !window.confirm(`Put back all ${entries.length} tags from this session?`)
    ) {
      return;
    }
    setToast(null);
    setUndoingBulk(0);
    // Hold the scanner off: a book still in frame would otherwise be re-tagged
    // halfway through the revert it's part of.
    pausedRef.current = true;
    let done = 0;
    for (const entry of entries) {
      if (await tagBook(entry.key, entry.previous)) done++;
      setUndoingBulk(done);
    }
    pausedRef.current = false;
    setUndoingBulk(null);
    setBulkSession([]);
    lastSeen.current.clear();
    say(
      done === entries.length,
      done === entries.length
        ? `Session undone — ${done} ${done === 1 ? "tag" : "tags"} put back.`
        : `Put back ${done} of ${entries.length} tags — the rest failed.`
    );
    onCatalogChange?.();
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = manual.replace(/[^0-9Xx]/g, "").toUpperCase();
    const code = cleaned.length === 12 ? upcAToEan13(cleaned) : cleaned;
    if (!code || (code.length !== 10 && code.length !== 13)) {
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
    const res = await fetch(withBase(`/api/admin/books/${result.book.id}`), {
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
        const back = await fetch(withBase("/api/admin/books/add"), {
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
        const rev = await fetch(withBase(`/api/admin/books/${bookId}`), {
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
    const res = await fetch(withBase("/api/admin/books/add"), {
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
      // A clamped add changed nothing, so there is nothing to undo — and the
      // server says so rather than letting "Added" stand for a no-op.
      say(
        !data.clamped,
        data.message ?? "Added to the catalog.",
        data.clamped
          ? undefined
          : async () => {
              const rev = await fetch(withBase(`/api/admin/books/${data.book.id}`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ delta: -1 }),
              });
              if (rev.ok) {
                setResult({ code, found: false, external: ext });
                say(true, "Undone — not added.");
                onCatalogChange?.();
              }
            }
      );
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
            <a className="scan-close desk-only" href={withBase("/admin")} aria-label="Leave scanner">
              ✕
            </a>
          )}
        </div>

        {mode === "bulk" && (
          <div className="scan-bulkbar">
            <span className="scan-bulkhint">
              {bulkTag ? "Every scan tags the book:" : "Which category is this session tagging?"}
            </span>
            <TagPicker value={bulkTag} onChange={(t) => t && setBulkTag(t)} disabled={undoingBulk !== null} />
            {bulkTag && (
              <div
                className="scan-session"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  borderTop: "1px solid var(--line)",
                  paddingTop: 8,
                }}
              >
                <span className="scan-bulkhint">
                  Bulk tag: {CATEGORIES[bulkTag].label} · {bulkSession.length}{" "}
                  {bulkSession.length === 1 ? "book" : "books"} tagged
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "6px 12px", fontSize: 12.5 }}
                  disabled={bulkSession.length === 0 || undoingBulk !== null}
                  onClick={undoBulkSession}
                >
                  {undoingBulk === null
                    ? "Undo session"
                    : `Undoing ${undoingBulk}/${bulkSession.length}…`}
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "putaway" && (
          <div className="scan-putaway">
            {putaway ? (
              putaway.where?.ranged ? (
                <>
                  <div className="pa-book">{putaway.title}</div>
                  <div className="pa-shelf">
                    {putaway.where.shelves[0].shelf_number
                      ? `Shelf ${putaway.where.shelves[0].shelf_number}`
                      : putaway.where.shelves[0].label}
                  </div>
                  <div className="pa-sub">
                    {putaway.where.shelves[0].shelf_number ? putaway.where.shelves[0].label : ""}
                    {putaway.where.shelves[0].letter_range ? ` · ${putaway.where.shelves[0].letter_range}` : ""}
                  </div>
                  <a className="pa-map" href={withBase(`/admin/map?shelf=${putaway.where.shelves[0].id}`)}>
                    Show on map →
                  </a>
                </>
              ) : putaway.where ? (
                // Category matched but no letter range did: the shelf number
                // would be a guess, so say what's actually known instead.
                <>
                  <div className="pa-book">{putaway.title}</div>
                  <div className="pa-sub">Somewhere in {CATEGORIES[putaway.where.tag].label}</div>
                  <div className="pa-hint">no letter range set for these shelves</div>
                  {putaway.where.shelves.length === 1 && (
                    <a className="pa-map" href={withBase(`/admin/map?shelf=${putaway.where.shelves[0].id}`)}>
                      Show on map →
                    </a>
                  )}
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
                    src={withBase(`/api/admin/books/cover?isbn=${isbnFor}`)}
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
                  {where && <ShelfLine where={where} />}
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
                    src={withBase(`/api/admin/books/cover?isbn=${isbnFor}`)}
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
