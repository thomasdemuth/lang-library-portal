"use client";

import { useEffect, useId, useRef, useState } from "react";
import BarcodeOverlay from "@/components/BarcodeOverlay";
import { announce } from "@/components/Announcer";
import { Ic } from "@/components/icons";
import { checkOut, returnCheckout } from "@/lib/checkout-client";
import { dueLabel, isOverdue } from "@/lib/circulation";
import { fireConfetti } from "@/lib/confetti";
import type { NoteKind } from "@/lib/book-actions-client";
import { displayName, displayNameFull } from "@/lib/play";
import { withBase } from "@/lib/base";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; copies: number; dedupe_key: string };
type OpenRow = { id: number; student_email: string; checked_out_by: string; checked_out_via: string; due_at: string; created_at: string };
type StatusRow = OpenRow & { book_key: string; title: string; isbn13: string | null };
type Student = { email: string; name: string };

/**
 * The circulation desk — scan (or type) a book, pick the student, one tap
 * to check out or in. One component serves every adult surface: the staff
 * "Checkout Desk" tab and the top of Management → Circulation (`onChange`
 * lets that page refresh its table after a desk action). Built phone-first:
 * the buttons are big, the scanner is the first thing offered, and the
 * student you picked stays picked until you clear them — checking a stack
 * of books out to one kid is scan, tap, scan, tap.
 */
export default function CirculationDesk({
  onChange,
  showStatus = true,
}: {
  onChange?: () => void;
  showStatus?: boolean;
}) {
  const bookListId = useId();
  const studentListId = useId();

  // ── the student chip ───────────────────────────────────────────────────
  const [student, setStudent] = useState<Student | null>(null);
  const [studentQ, setStudentQ] = useState("");
  const [studentOpts, setStudentOpts] = useState<Student[]>([]);
  const [recent, setRecent] = useState<Student[]>([]);
  // ── the book ───────────────────────────────────────────────────────────
  const [book, setBook] = useState<Book | null>(null);
  const [openForBook, setOpenForBook] = useState<OpenRow[]>([]);
  const [bookQ, setBookQ] = useState("");
  const [bookOpts, setBookOpts] = useState<Book[]>([]);
  const [scanning, setScanning] = useState(false);
  // ── plumbing ───────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; kind: NoteKind } | null>(null);
  const [status, setStatus] = useState<StatusRow[] | null>(null);
  const [statusQ, setStatusQ] = useState("");
  const debounceBook = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceStudent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceStatus = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(text: string, kind: NoteKind = "ok") {
    setNote({ text, kind });
    announce(text, kind === "err");
    setTimeout(() => setNote((cur) => (cur?.text === text ? null : cur)), 4200);
  }

  // ── data ───────────────────────────────────────────────────────────────
  async function loadStatus(query = statusQ) {
    if (!showStatus) return;
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const res = await fetch(withBase(`/api/checkouts/status${params}`));
    const data = await res.json().catch(() => ({}));
    if (res.ok) setStatus(data.open ?? []);
  }
  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOpenForBook(b: Book) {
    const res = await fetch(withBase(`/api/checkouts/book?key=${encodeURIComponent(b.dedupe_key)}`));
    const data = await res.json().catch(() => ({}));
    setOpenForBook(res.ok ? data.open ?? [] : []);
  }

  function selectBook(b: Book) {
    setBook(b);
    setBookQ("");
    setBookOpts([]);
    loadOpenForBook(b);
  }

  // Book title type-ahead (same catalog search the kiosk uses).
  useEffect(() => {
    if (debounceBook.current) clearTimeout(debounceBook.current);
    const q = bookQ.trim();
    if (q.length < 2) {
      setBookOpts([]);
      return;
    }
    debounceBook.current = setTimeout(() => {
      fetch(withBase(`/api/catalog?q=${encodeURIComponent(q)}`))
        .then((r) => r.json())
        .then((d) => setBookOpts((d.books ?? []).slice(0, 6)))
        .catch(() => {});
    }, 200);
  }, [bookQ]);

  // Student type-ahead.
  useEffect(() => {
    if (debounceStudent.current) clearTimeout(debounceStudent.current);
    const q = studentQ.trim();
    if (q.length < 2 || q.includes("@")) {
      setStudentOpts([]);
      return;
    }
    debounceStudent.current = setTimeout(() => {
      fetch(withBase(`/api/students/suggest?q=${encodeURIComponent(q)}`))
        .then((r) => r.json())
        .then((d) => setStudentOpts(d.students ?? []))
        .catch(() => {});
    }, 250);
  }, [studentQ]);

  function pickStudent(s: Student) {
    setStudent(s);
    setStudentQ("");
    setStudentOpts([]);
    setRecent((cur) => [s, ...cur.filter((r) => r.email !== s.email)].slice(0, 4));
  }

  function resolveStudent() {
    const t = studentQ.trim().toLowerCase();
    if (!t) return;
    if (t.includes("@")) return pickStudent({ email: t, name: displayNameFull(t) });
    const asLocal = t.replace(/\s+/g, ".").replace(/[^a-z0-9.-]/g, "");
    const hit = studentOpts.find((s) => s.name.toLowerCase() === t || s.email.startsWith(`${asLocal}@`)) ?? studentOpts[0];
    if (hit) return pickStudent(hit);
    if (asLocal) pickStudent({ email: `${asLocal}@students.thelangschool.org`, name: displayNameFull(asLocal) });
  }

  // ── scanning ───────────────────────────────────────────────────────────
  async function onScanCode(code: string) {
    const res = await fetch(withBase(`/api/catalog/lookup?code=${encodeURIComponent(code)}`));
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.found) {
      setScanning(false);
      selectBook(data.book);
    } else {
      say(res.ok ? `No book with barcode ${code} in the catalog.` : data.error ?? "Lookup failed.", "warn");
      setScanning(false);
    }
  }

  // ── the two verbs ──────────────────────────────────────────────────────
  async function doCheckOut() {
    if (!book || !student || busy) return;
    setBusy(true);
    try {
      const result = await checkOut({ title: book.title, dedupe_key: book.dedupe_key, isbn13: book.isbn13 }, student.email);
      if ("error" in result) return say(result.error, result.kind);
      fireConfetti(40);
      say([result.message, ...result.warnings].join(" "), result.warnings.length ? "warn" : "ok");
      loadOpenForBook(book);
      loadStatus();
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function doCheckIn(id: number, who: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await returnCheckout(id);
      if ("error" in result) return say(result.error, result.kind);
      fireConfetti(40);
      say(`Checked in — thanks, ${displayName(who)}!`);
      if (book) loadOpenForBook(book);
      loadStatus();
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  const bigBtn: React.CSSProperties = { fontSize: 16, padding: "12px 18px" };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {note && (
        <div className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`} role="status" aria-live="polite">
          {note.text}
        </div>
      )}

      {/* ── 1 · the book ──────────────────────────────────────────────── */}
      {!book ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn brand" style={bigBtn} onClick={() => setScanning(true)}>
              <Ic name="camera" size={17} /> Scan a book
            </button>
          </div>
          <div style={{ position: "relative", marginTop: 10 }}>
            <input
              className="input"
              style={{ fontSize: 16 }}
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={bookOpts.length > 0}
              aria-controls={bookListId}
              aria-label="Or type the book's title"
              placeholder="…or type the title"
              value={bookQ}
              onChange={(e) => setBookQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bookOpts.length > 0) {
                  e.preventDefault();
                  selectBook(bookOpts[0]);
                }
              }}
            />
            {bookOpts.length > 0 && (
              <ul
                id={bookListId}
                role="listbox"
                aria-label="Matching books"
                style={{
                  listStyle: "none",
                  margin: "6px 0 0",
                  padding: 4,
                  border: "1px solid var(--line, #dcdfe6)",
                  borderRadius: 10,
                  background: "#fff",
                  boxShadow: "0 8px 24px rgba(20,24,40,.10)",
                  position: "absolute",
                  insetInline: 0,
                  zIndex: 20,
                }}
              >
                {bookOpts.map((b) => (
                  <li key={b.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => selectBook(b)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "9px 10px",
                        border: 0,
                        borderRadius: 8,
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        font: "inherit",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                      <span className="hint" style={{ display: "block", margin: 0 }}>
                        {b.creators ?? "Unknown author"} · {b.copies} in the library
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {book.isbn13 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={withBase(`/api/catalog/cover?isbn=${book.isbn13}`)}
              alt=""
              width={46}
              height={68}
              style={{ borderRadius: 5, objectFit: "cover", flex: "none" }}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{book.title}</b>
            <span className="hint" style={{ display: "block", margin: 0 }}>
              {book.creators ?? "Unknown author"} · {book.copies} owned ·{" "}
              {openForBook.length === 0 ? "none out" : `${openForBook.length} out`}
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={() => { setBook(null); setOpenForBook([]); }}>
            ✕
          </button>
        </div>
      )}

      {/* ── 2 · the student ───────────────────────────────────────────── */}
      <div style={{ marginTop: 12 }}>
        {student ? (
          <span className="pill" style={{ background: "#e7f6f3", color: "#175f55", fontSize: 14, padding: "6px 12px" }}>
            {student.name}
            <button
              type="button"
              onClick={() => setStudent(null)}
              aria-label={`Clear student ${student.name}`}
              style={{ border: 0, background: "none", cursor: "pointer", marginLeft: 6, font: "inherit", color: "inherit" }}
            >
              ✕
            </button>
          </span>
        ) : (
          <>
            <input
              className="input"
              style={{ fontSize: 16 }}
              type="text"
              autoComplete="off"
              list={studentListId}
              aria-label="Which student?"
              placeholder="Which student? Type a name or school email"
              value={studentQ}
              onChange={(e) => setStudentQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  resolveStudent();
                }
              }}
              onBlur={() => {
                // A picked datalist option lands here as the full email.
                if (studentQ.includes("@")) resolveStudent();
              }}
            />
            <datalist id={studentListId}>
              {studentOpts.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.name}
                </option>
              ))}
            </datalist>
            {recent.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {recent.map((s) => (
                  <button key={s.email} type="button" className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => pickStudent(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 3 · the verbs ─────────────────────────────────────────────── */}
      {book && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn brand" style={bigBtn} disabled={busy || !student} onClick={doCheckOut}>
              {student ? `Check out to ${student.name}` : "Check out (pick a student)"}
            </button>
            {openForBook.length === 1 && (
              <button
                type="button"
                className="btn"
                style={bigBtn}
                disabled={busy}
                onClick={() => doCheckIn(openForBook[0].id, openForBook[0].student_email)}
              >
                Check in — {displayNameFull(openForBook[0].student_email)}
              </button>
            )}
          </div>
          {openForBook.length > 1 && (
            <div>
              <p className="hint" style={{ margin: "4px 0 6px" }}>Check in — who's bringing it back?</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {openForBook.map((r) => (
                  <button key={r.id} type="button" className="btn" disabled={busy} onClick={() => doCheckIn(r.id, r.student_email)}>
                    {displayNameFull(r.student_email)} · {dueLabel(r.due_at)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4 · who has what ──────────────────────────────────────────── */}
      {showStatus && status !== null && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--line, #e5e2d8)", paddingTop: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 15 }}>
            <Ic name="backpack" size={15} /> Out right now · {status.length}
          </h2>
          <input
            className="input"
            type="search"
            aria-label="Filter by student or title"
            placeholder="Filter by student or title…"
            value={statusQ}
            onChange={(e) => {
              const v = e.target.value;
              setStatusQ(v);
              if (debounceStatus.current) clearTimeout(debounceStatus.current);
              debounceStatus.current = setTimeout(() => loadStatus(v), 300);
            }}
          />
          {status.length === 0 ? (
            <p className="hint" style={{ marginBottom: 0 }}>No books are out right now.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {status.map((r) => {
                const overdue = isOverdue(r.due_at);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
                      <span className="hint" style={{ display: "block", margin: 0 }}>
                        {displayNameFull(r.student_email)} ·{" "}
                        <span style={{ color: overdue ? "#8f1b23" : undefined, fontWeight: overdue ? 600 : undefined }}>
                          {dueLabel(r.due_at)}
                        </span>
                      </span>
                    </span>
                    <button type="button" className="btn" disabled={busy} onClick={() => doCheckIn(r.id, r.student_email)}>
                      Check in
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {scanning && (
        <BarcodeOverlay hint="Point at the barcode on the back" onCode={onScanCode} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
