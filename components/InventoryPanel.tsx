"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { mergeBooks, rowToBook, type BookRecord } from "@/lib/match";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import TagPicker, { TagPill } from "@/components/TagPicker";
import TagReviewPanel from "@/components/TagReviewPanel";

type Sync = {
  id: number;
  status: string;
  source_filename: string | null;
  row_count: number | null;
  merged_count: number | null;
  started_at: string;
  activated_at: string | null;
};
type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  group_name: string | null;
  dedupe_key: string;
  tag: CategoryId | null;
};

/** "untagged" narrows to books with no tag yet; null is no filter. */
type TagFilter = CategoryId | "untagged" | null;

type BookDetail = {
  isbn13: string | null;
  isbn10: string | null;
  description: string | null;
  notes: string | null;
};

type Parsed = {
  filename: string;
  rawRows: number;
  skipped: number;
  books: BookRecord[];
  totalCopies: number;
};

const BATCH = 500;

/** Optional catalog columns — Title is fixed. Order + visibility are a
 *  per-device preference set from the gear menu. */
const CATALOG_COLS = [
  { id: "tag", label: "Tag" },
  { id: "creators", label: "Creators" },
  { id: "isbn13", label: "ISBN-13" },
  { id: "copies", label: "Copies" },
] as const;
type ColId = (typeof CATALOG_COLS)[number]["id"];
type ColPref = { id: ColId; on: boolean };
const DEFAULT_COLS: ColPref[] = CATALOG_COLS.map((c) => ({ id: c.id, on: true }));
const COL_LABEL = Object.fromEntries(CATALOG_COLS.map((c) => [c.id, c.label])) as Record<ColId, string>;
const COLS_KEY = "ll-catalog-cols";

export default function InventoryPanel({ canImport }: { canImport: boolean }) {
  const [active, setActive] = useState<Sync | null>(null);
  const [bookCount, setBookCount] = useState(0);
  const [history, setHistory] = useState<Sync[]>([]);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TagFilter>(null);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tagOpen, setTagOpen] = useState<number | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagUndo, setTagUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [finding, setFinding] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, BookDetail>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [cols, setCols] = useState<ColPref[]>(DEFAULT_COLS);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
      if (!Array.isArray(raw)) return;
      const saved = raw
        .filter((r): r is { id: ColId; on?: boolean } => CATALOG_COLS.some((c) => c.id === r?.id))
        .filter((r, i, arr) => arr.findIndex((s) => s.id === r.id) === i)
        .map((r) => ({ id: r.id, on: r.on !== false }));
      // Columns added after the pref was saved get appended, visible.
      const ids = new Set(saved.map((c) => c.id));
      setCols([...saved, ...DEFAULT_COLS.filter((c) => !ids.has(c.id))]);
    } catch {}
  }, []);
  function updateCols(next: ColPref[]) {
    setCols(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {}
  }
  function toggleCol(id: ColId) {
    updateCols(cols.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));
  }
  function moveCol(i: number, d: -1 | 1) {
    const next = [...cols];
    const [c] = next.splice(i, 1);
    next.splice(i + d, 0, c);
    updateCols(next);
  }
  const visibleCols = cols.filter((c) => c.on);

  async function load() {
    const res = await fetch("/api/admin/inventory/syncs");
    const data = await res.json();
    if (res.ok) {
      setActive(data.active);
      setBookCount(data.bookCount);
      setHistory(data.syncs ?? []);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setNotice(null);
    setParsed(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("That doesn't look like a CSV file — export it from Libib first.");
      return;
    }
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (out) => {
        const books: BookRecord[] = [];
        let skipped = 0;
        for (const row of out.data) {
          const b = rowToBook(row);
          if (b) books.push(b);
          else skipped++;
        }
        if (books.length === 0) {
          setError("No usable rows found — is this the Libib library export?");
          return;
        }
        const merged = mergeBooks(books);
        setParsed({
          filename: file.name,
          rawRows: out.data.length,
          skipped,
          books: merged,
          totalCopies: merged.reduce((n, b) => n + b.copies, 0),
        });
      },
      error: () => setError("Couldn't read that file."),
    });
  }, []);

  async function runImport() {
    if (!parsed) return;
    setProgress(0);
    setError(null);
    try {
      const create = await fetch("/api/admin/inventory/syncs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_filename: parsed.filename }),
      });
      const { sync_id, error: cErr } = await create.json();
      if (!create.ok) throw new Error(cErr ?? "Couldn't start the import.");

      for (let i = 0; i < parsed.books.length; i += BATCH) {
        const rows = parsed.books.slice(i, i + BATCH).map(({ ...r }) => r);
        const res = await fetch(`/api/admin/inventory/syncs/${sync_id}/rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        if (!res.ok) {
          await fetch(`/api/admin/inventory/syncs/${sync_id}`, { method: "DELETE" });
          throw new Error((await res.json()).error ?? "Upload failed — import aborted.");
        }
        setProgress(Math.min(99, Math.round(((i + rows.length) / parsed.books.length) * 100)));
      }

      const commit = await fetch(`/api/admin/inventory/syncs/${sync_id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row_count: parsed.rawRows, merged_count: parsed.books.length }),
      });
      if (!commit.ok) throw new Error((await commit.json()).error ?? "Couldn't activate the import.");

      setProgress(100);
      setNotice(
        `Inventory replaced: ${parsed.books.length.toLocaleString()} titles (${parsed.totalCopies.toLocaleString()} copies) from ${parsed.rawRows.toLocaleString()} CSV rows.`
      );
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setTimeout(() => setProgress(null), 800);
    }
  }

  const filterParam = (tag: TagFilter) =>
    tag === "untagged" ? "&untagged=1" : tag ? `&tag=${tag}` : "";

  async function search(e?: React.FormEvent, tagOverride?: TagFilter) {
    e?.preventDefault();
    setTagError(null);
    const tag = tagOverride === undefined ? filter : tagOverride;
    const res = await fetch(`/api/admin/books?q=${encodeURIComponent(q)}${filterParam(tag)}`);
    const data = await res.json();
    if (res.ok) {
      setResults(data.books);
      setTotal(data.total);
      setPage(0);
      setExpanded(null);
    } else {
      setTagError(data.error ?? "Search failed.");
    }
  }

  function setFilterAndSearch(tag: TagFilter) {
    setFilter(tag);
    search(undefined, tag);
  }

  // Browse without typing: the whole catalog, A→Z, straight away.
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/books?q=${encodeURIComponent(q)}&page=${page + 1}${filterParam(filter)}`
      );
      const data = await res.json();
      if (res.ok) {
        setResults((cur) => [...(cur ?? []), ...data.books]);
        setPage(data.page);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  /** "Where is this book?" → jump to the map with its shelf highlighted. */
  async function findShelf(b: Book) {
    setFinding(b.id);
    setTagError(null);
    try {
      const res = await fetch(`/api/admin/books/where?key=${encodeURIComponent(b.dedupe_key)}`);
      const data = await res.json();
      if (data.found && data.shelves?.length) {
        window.location.href = `/admin/map?shelf=${data.shelves[0].id}`;
        return;
      }
      setTagError(
        data.reason === "untagged"
          ? `Tag “${b.title}” first — the shelf is found through its category tag.`
          : `No shelf matches “${b.title}” yet — set categories and letter ranges on the map.`
      );
    } finally {
      setFinding(null);
    }
  }

  async function setTag(book: Book, tag: CategoryId | null, isUndo = false) {
    setTagError(null);
    const previous = book.tag;
    const res = await fetch("/api/admin/books/tag", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key: book.dedupe_key, category: tag }),
    });
    if (!res.ok) {
      setTagError((await res.json().catch(() => ({}))).error ?? "Couldn't save the tag.");
      return;
    }
    setResults((cur) => cur?.map((b) => (b.dedupe_key === book.dedupe_key ? { ...b, tag } : b)) ?? cur);
    setTagOpen(null);
    if (isUndo) {
      setTagUndo(null);
    } else {
      setTagUndo({
        text: tag ? `Tagged “${book.title}” → ${CATEGORIES[tag].label}` : `Cleared the tag on “${book.title}”`,
        run: () => setTag({ ...book, tag }, previous, true),
      });
      setTimeout(() => setTagUndo(null), 8000);
    }
  }

  /** Tap a row → expand it with cover, description, internal notes. */
  function toggleExpand(b: Book) {
    setExpanded((cur) => (cur === b.id ? null : b.id));
    if (details[b.id]) return;
    fetch(`/api/admin/books/${b.id}`)
      .then((res) => res.json())
      .then((data) => {
        setDetails((cur) => ({
          ...cur,
          [b.id]: data.book ?? { isbn13: b.isbn13, isbn10: null, description: null, notes: null },
        }));
      })
      .catch(() => {
        setDetails((cur) => ({
          ...cur,
          [b.id]: { isbn13: b.isbn13, isbn10: null, description: null, notes: null },
        }));
      });
  }

  /** One optional catalog cell, keyed so column order can change freely. */
  function cellFor(b: Book, id: ColId) {
    if (id === "tag") {
      return (
        <td key="tag" data-th="Tag">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {canImport ? (
              tagOpen === b.id ? (
                <TagPicker value={b.tag} onChange={(t) => setTag(b, t)} />
              ) : (
                <button
                  type="button"
                  className="tagbtn"
                  onClick={() => setTagOpen(b.id)}
                  aria-label={`Change tag for ${b.title}`}
                >
                  {b.tag ? <TagPill tag={b.tag} /> : <span className="tag-none">+ tag</span>}
                </button>
              )
            ) : b.tag ? (
              <TagPill tag={b.tag} />
            ) : (
              "—"
            )}
            {b.tag && tagOpen !== b.id && (
              <button
                type="button"
                className="findbtn"
                disabled={finding === b.id}
                onClick={() => findShelf(b)}
                aria-label={`Show ${b.title} on the map`}
                title="Show on the map"
              >
                {finding === b.id ? "…" : "📍"}
              </button>
            )}
          </span>
        </td>
      );
    }
    if (id === "creators") return <td key="creators" data-th="Creators">{b.creators ?? "—"}</td>;
    if (id === "isbn13") return <td key="isbn13" data-th="ISBN-13">{b.isbn13 ?? "—"}</td>;
    return <td key="copies" data-th="Copies">{b.copies}</td>;
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Mobile: sits directly under the Manage Book Requests button */}
      {canImport && (
        <button
          className="btn mobile-only"
          style={{ width: "100%", marginBottom: 14 }}
          onClick={() => setReviewing(true)}
        >
          ✨ Review suggested tags
        </button>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        {reviewing && (
          <TagReviewPanel
            onDone={() => {
              setReviewing(false);
              search();
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
          <form onSubmit={search} className="searchrow" style={{ flex: 1 }}>
            <input
              className="input"
              placeholder="Title or author…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="searchbtn" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.5-4.5" />
              </svg>
            </button>
          </form>
          {canImport && (
            <button
              type="button"
              className={`gearbtn desk-only${settingsOpen ? " on" : ""}`}
              aria-label="Catalog settings"
              aria-expanded={settingsOpen}
              title="Catalog settings"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>
        {canImport && settingsOpen && (
          <div className="catset desk-only">
            <div>
              <label className="lbl">Inventory</label>
              <p className="hint" style={{ margin: "2px 0 10px" }}>
                {active ? (
                  <>
                    <b>{bookCount.toLocaleString()}</b> titles live · from{" "}
                    <b>{active.source_filename ?? "CSV"}</b> · imported{" "}
                    {active.activated_at ? new Date(active.activated_at).toLocaleString() : "—"}
                  </>
                ) : (
                  "No inventory yet — upload the Libib CSV export."
                )}
              </p>
              <div
                className={`catset-drop${dragOver ? " over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <p className="hint" style={{ margin: "0 0 8px" }}>
                  Libib → your library → Export → CSV. Drop the file here (or choose it). The
                  current inventory stays live until the new one is fully imported, then they
                  swap atomically.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {parsed && (
                  <div style={{ marginTop: 12 }}>
                    <div className="notice">
                      <b>{parsed.filename}</b>: {parsed.books.length.toLocaleString()} unique titles ·{" "}
                      {parsed.totalCopies.toLocaleString()} total copies · from{" "}
                      {parsed.rawRows.toLocaleString()} rows
                      {parsed.skipped > 0 ? ` (${parsed.skipped} rows without titles skipped)` : ""}
                    </div>
                    <button className="btn primary" onClick={runImport} disabled={progress !== null}>
                      {progress !== null ? `Importing… ${progress}%` : "Import & replace inventory"}
                    </button>
                  </div>
                )}
                {progress !== null && (
                  <div style={{ marginTop: 12, background: "#eef0f5", borderRadius: 6, height: 10 }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        borderRadius: 6,
                        background: "var(--ok)",
                        transition: "width .2s",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="lbl">Catalog columns</label>
              <p className="hint" style={{ margin: "2px 0 8px" }}>
                Title always shows. Reorder with the arrows.
              </p>
              {cols.map((c, i) => (
                <div key={c.id} className="colrow">
                  <label className="check">
                    <input type="checkbox" checked={c.on} onChange={() => toggleCol(c.id)} />
                    {COL_LABEL[c.id]}
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === 0}
                    onClick={() => moveCol(i, -1)}
                    aria-label={`Move ${COL_LABEL[c.id]} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === cols.length - 1}
                    onClick={() => moveCol(i, 1)}
                    aria-label={`Move ${COL_LABEL[c.id]} down`}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="tagpicker tagfilter" style={{ marginTop: 10 }} role="radiogroup" aria-label="Filter by tag">
          {CATEGORY_IDS.map((id) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`tagchip${active ? " active" : ""}`}
                style={active ? { background: CATEGORIES[id].color, borderColor: CATEGORIES[id].color, color: "#fff" } : undefined}
                onClick={() => setFilterAndSearch(active ? null : id)}
                title={CATEGORIES[id].label}
              >
                {!active && <span className="dot" style={{ background: CATEGORIES[id].color }} />}
                <span className="tagchip-label">{CATEGORIES[id].label}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={filter === "untagged"}
            className={`tagchip untagged${filter === "untagged" ? " active" : ""}`}
            onClick={() => setFilterAndSearch(filter === "untagged" ? null : "untagged")}
            title="Untagged"
          >
            {filter !== "untagged" && <span className="dot dot-none" />}
            <span className="tagchip-label">Untagged</span>
          </button>
          {canImport && (
            <button type="button" className="tagchip desk-only" onClick={() => setReviewing(true)}>
              ✨ Suggested tags
            </button>
          )}
        </div>
        {tagError && <div className="error" style={{ marginTop: 10 }}>{tagError}</div>}
        {tagUndo && (
          <div className="notice" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ flex: 1 }}>{tagUndo.text}</span>
            <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => tagUndo.run()}>
              ↩ Undo
            </button>
          </div>
        )}
        {results && (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              {total.toLocaleString()} {q.trim() ? `result${total === 1 ? "" : "s"}` : "titles"}
              {total > results.length ? ` (showing ${results.length.toLocaleString()})` : ""}
            </p>
            <div className="tablewrap">
              <table className="table books">
                <thead>
                  <tr>
                    <th>Title</th>
                    {visibleCols.map((c) => (
                      <th key={c.id}>{COL_LABEL[c.id]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((b) => {
                    const open = expanded === b.id;
                    const d = details[b.id];
                    const coverIsbn = d?.isbn13 ?? d?.isbn10 ?? b.isbn13;
                    return (
                      <Fragment key={b.id}>
                        <tr
                          className={`bookrow${open ? " open" : ""}`}
                          aria-expanded={open}
                          onClick={() => toggleExpand(b)}
                        >
                          <td data-th="Title">{b.title}</td>
                          {visibleCols.map((c) => cellFor(b, c.id))}
                        </tr>
                        {open && (
                          <tr className="bookrow-detail">
                            <td colSpan={1 + visibleCols.length}>
                              <div className="bookdetail">
                                {coverIsbn && (
                                  <img
                                    className="bookcover"
                                    src={`/api/admin/books/cover?isbn=${coverIsbn}`}
                                    alt={`Cover of ${b.title}`}
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                )}
                                <div>
                                  {!d ? (
                                    <p className="hint" style={{ marginTop: 0 }}>Loading…</p>
                                  ) : (
                                    <>
                                      {d.description ? (
                                        <p className="bookdesc">{d.description}</p>
                                      ) : (
                                        <p className="hint" style={{ marginTop: 0 }}>No description on file.</p>
                                      )}
                                      {d.notes && (
                                        <p className="booknotes">
                                          <b>Internal:</b> {d.notes}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length < total && (
              <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Show more (${(total - results.length).toLocaleString()} left)`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="card desk-only">
        <h2 style={{ marginTop: 0 }}>Import history</h2>
        {history.length === 0 ? (
          <p className="hint">No imports yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Titles</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.started_at).toLocaleString()}</td>
                  <td>{s.source_filename ?? "—"}</td>
                  <td>{s.merged_count?.toLocaleString() ?? "—"}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background:
                          s.status === "active"
                            ? "#e7f6f3"
                            : s.status === "pending"
                              ? "#fff6e6"
                              : "#f3f4f7",
                      }}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
