"use client";

import { useEffect, useRef, useState } from "react";
import BarcodeOverlay from "@/components/BarcodeOverlay";
import { announce } from "@/components/Announcer";
import { Check, Ic } from "@/components/icons";
import { checkOut, myCheckouts, returnCheckout, type MyCheckout } from "@/lib/checkout-client";
import { dueLabel, isOverdue } from "@/lib/circulation";
import { fireConfetti } from "@/lib/confetti";
import type { NoteKind } from "@/lib/book-actions-client";
import { withBase } from "@/lib/base";

type Suggestion = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  dedupe_key: string;
};

/**
 * "Take a Book Home" — self-checkout built for a school computer with no
 * camera: one big type-ahead box, arrow keys + Enter all the way through.
 *
 * The flow is three beats: type the title (suggestions appear as you type),
 * pick the book (a confirm card, so a slipped click can't check anything
 * out), press the one big button. The success screen says when it's due and
 * offers "take another". Below it, the books you already have out, each
 * with an "I brought it back" button — so this one page is the whole
 * borrowing loop, going out and coming home.
 */
export default function TakeHomeKiosk() {
  // ── search / pick ──────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [openList, setOpenList] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  // ── confirm / done ─────────────────────────────────────────────────────
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; message: string; warnings: string[] } | null>(null);
  const [note, setNote] = useState<{ text: string; kind: NoteKind } | null>(null);
  // ── my books ───────────────────────────────────────────────────────────
  const [mine, setMine] = useState<MyCheckout[] | null>(null);
  const [returning, setReturning] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0); // drop out-of-order search responses

  async function loadMine() {
    const result = await myCheckouts();
    if (!("error" in result)) setMine(result.open);
  }
  useEffect(() => {
    loadMine();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = q.trim();
    if (query.length < 2) {
      setOptions([]);
      setOpenList(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    debounce.current = setTimeout(() => {
      fetch(withBase(`/api/catalog?q=${encodeURIComponent(query)}`))
        .then((r) => r.json())
        .then((d) => {
          if (mySeq !== seq.current) return; // a newer keystroke owns the box
          const books: Suggestion[] = (d.books ?? []).slice(0, 8);
          setOptions(books);
          setHighlight(0);
          setOpenList(true);
          setSearching(false);
        })
        .catch(() => {
          if (mySeq === seq.current) setSearching(false);
        });
    }, 200);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  function pick(b: Suggestion) {
    setPicked(b);
    setOpenList(false);
    setNote(null);
    announce(`${b.title} selected — press Take this book home to finish.`, false);
  }

  /** Phone path: scan the barcode on the back instead of typing. */
  async function onScanCode(code: string) {
    try {
      const res = await fetch(withBase(`/api/catalog/lookup?code=${encodeURIComponent(code)}`));
      const data = await res.json().catch(() => ({}));
      setScanning(false);
      if (res.ok && data.found) {
        pick(data.book);
      } else {
        const text = res.ok
          ? "Hmm, that barcode isn't in our library — try typing the title instead."
          : data.error ?? "Couldn't look that up — try typing the title.";
        setNote({ text, kind: "warn" });
        announce(text, false);
      }
    } catch {
      setScanning(false);
    }
  }

  function backToSearch(clear = false) {
    setPicked(null);
    setDone(null);
    setNote(null);
    if (clear) {
      setQ("");
      setOptions([]);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!openList || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === "Escape") {
      setOpenList(false);
    }
  }

  async function takeHome() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const result = await checkOut({ title: picked.title, dedupe_key: picked.dedupe_key, isbn13: picked.isbn13 });
      if ("error" in result) {
        setNote({ text: result.error, kind: result.kind });
        announce(result.error, result.kind === "err");
        return;
      }
      setDone({ title: picked.title, message: result.message, warnings: result.warnings });
      fireConfetti();
      setPicked(null);
      setQ("");
      setOptions([]);
      announce(`${picked.title} is yours! ${result.message}`, false);
      loadMine();
    } finally {
      setBusy(false);
    }
  }

  async function bringBack(c: MyCheckout) {
    setReturning(c.id);
    try {
      const result = await returnCheckout(c.id);
      const text = "error" in result ? result.error : result.message;
      announce(text, "error" in result && result.kind === "err");
      setNote({ text, kind: "error" in result ? result.kind : "ok" });
      if (!("error" in result)) fireConfetti(50); // bringing one back deserves a little paper too
      loadMine();
    } finally {
      setReturning(null);
    }
  }

  const listId = "takehome-options";

  return (
    <>
      {/* ── the one box ─────────────────────────────────────────────── */}
      {!picked && !done && (
        <div className="card" style={{ marginBottom: 18 }}>
          <label className="lbl" htmlFor="takehome-q" style={{ fontSize: 15 }}>
            What book are you holding?
          </label>
          <p className="hint" style={{ marginTop: 2 }}>
            Start typing the title — then pick it from the list.
          </p>
          {note && (
            <div className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`} role="status" aria-live="polite">
              {note.text}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              id="takehome-q"
              className="input"
              style={{ fontSize: 17, padding: "12px 14px" }}
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={openList}
              aria-controls={listId}
              aria-activedescendant={openList && options.length > 0 ? `${listId}-${highlight}` : undefined}
              placeholder="Type the book's title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {openList && (
              <ul
                id={listId}
                role="listbox"
                aria-label="Matching books"
                style={{
                  listStyle: "none",
                  margin: "6px 0 0",
                  padding: 4,
                  border: "1px solid var(--line, #dcdfe6)",
                  borderRadius: 10,
                  background: "var(--card, #fff)",
                  boxShadow: "0 8px 24px rgba(20,24,40,.10)",
                  position: "absolute",
                  insetInline: 0,
                  zIndex: 20,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {options.length === 0 ? (
                  <li className="hint" style={{ padding: 12, margin: 0 }} aria-disabled>
                    {searching ? "Looking…" : "No books match that — check the spelling, or ask at the desk."}
                  </li>
                ) : (
                  options.map((b, i) => (
                    <li key={b.id} role="option" id={`${listId}-${i}`} aria-selected={i === highlight}>
                      <button
                        type="button"
                        onClick={() => pick(b)}
                        onMouseEnter={() => setHighlight(i)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          width: "100%",
                          padding: "8px 10px",
                          border: 0,
                          borderRadius: 8,
                          background: i === highlight ? "var(--wash, #eef1f8)" : "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                          font: "inherit",
                        }}
                      >
                        {b.isbn13 && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={withBase(`/api/catalog/cover?isbn=${b.isbn13}`)}
                            alt=""
                            width={34}
                            height={50}
                            style={{ borderRadius: 4, objectFit: "cover", flex: "none" }}
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        )}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{b.title}</span>
                          <span className="hint" style={{ margin: 0 }}>
                            {b.creators ?? "Unknown author"} · {b.copies} in the library
                          </span>
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {/* Phone path: no typing at all — point the camera at the back cover. */}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setScanning(true)}>
              <Ic name="camera" size={16} /> Scan the barcode instead
            </button>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              On a phone? Point the camera at the barcode on the back of the book.
            </p>
          </div>
        </div>
      )}

      {scanning && (
        <BarcodeOverlay hint="Point at the barcode on the back" onCode={onScanCode} onClose={() => setScanning(false)} />
      )}

      {/* ── confirm ─────────────────────────────────────────────────── */}
      {picked && !done && (
        <div className="card" style={{ marginBottom: 18 }}>
          {note && (
            <div className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`} role="status" aria-live="polite">
              {note.text}
            </div>
          )}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {picked.isbn13 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={withBase(`/api/catalog/cover?isbn=${picked.isbn13}`)}
                alt=""
                width={72}
                height={106}
                style={{ borderRadius: 6, objectFit: "cover", flex: "none" }}
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0 }}>{picked.title}</h2>
              <p className="hint" style={{ margin: "4px 0 0" }}>{picked.creators ?? "Unknown author"}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button
              type="button"
              className="btn brand"
              style={{ fontSize: 16, padding: "12px 22px" }}
              autoFocus
              disabled={busy}
              onClick={takeHome}
            >
              {busy ? "One sec…" : "Take this book home"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => backToSearch(false)}>
              Not this one — search again
            </button>
          </div>
        </div>
      )}

      {/* ── done ────────────────────────────────────────────────────── */}
      {done && (
        <div className="card" style={{ marginBottom: 18, textAlign: "center", padding: "28px 18px" }}>
          <div aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>
            <Check done size={44} />
          </div>
          <h2 style={{ margin: "10px 0 4px" }}>“{done.title}” is yours!</h2>
          <p className="sub" style={{ margin: 0 }}>{done.message}</p>
          {done.warnings.map((w) => (
            <p key={w} className="notice warn" style={{ marginTop: 10, display: "inline-block" }}>
              {w}
            </p>
          ))}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn brand" autoFocus onClick={() => backToSearch(true)}>
              Take another book
            </button>
          </div>
        </div>
      )}

      {/* ── what I have out ─────────────────────────────────────────── */}
      {mine && mine.length > 0 && (
        <div className="card">
          <h2>
            <Ic name="backpack" size={16} /> Books I have out · {mine.length}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {mine.map((c) => {
              const overdue = isOverdue(c.due_at);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</span>
                    <span
                      className="hint"
                      style={{ display: "block", margin: 0, color: overdue ? "#8f1b23" : undefined, fontWeight: overdue ? 600 : undefined }}
                    >
                      {dueLabel(c.due_at)}
                    </span>
                  </span>
                  <button type="button" className="btn" disabled={returning === c.id} onClick={() => bringBack(c)}>
                    {returning === c.id ? "…" : "I brought it back"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
