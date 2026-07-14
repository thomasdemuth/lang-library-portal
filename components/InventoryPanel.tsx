"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type Parsed = {
  filename: string;
  rawRows: number;
  skipped: number;
  books: BookRecord[];
  totalCopies: number;
};

const BATCH = 500;

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
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tagOpen, setTagOpen] = useState<number | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [finding, setFinding] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);

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

  async function search(e?: React.FormEvent, tagOverride?: CategoryId | null) {
    e?.preventDefault();
    setTagError(null);
    const tag = tagOverride === undefined ? filter : tagOverride;
    const res = await fetch(`/api/admin/books?q=${encodeURIComponent(q)}${tag ? `&tag=${tag}` : ""}`);
    const data = await res.json();
    if (res.ok) {
      setResults(data.books);
      setTotal(data.total);
      setPage(0);
    } else {
      setTagError(data.error ?? "Search failed.");
    }
  }

  function setFilterAndSearch(tag: CategoryId | null) {
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
        `/api/admin/books?q=${encodeURIComponent(q)}&page=${page + 1}${filter ? `&tag=${filter}` : ""}`
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

  async function setTag(book: Book, tag: CategoryId | null) {
    setTagError(null);
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
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card desk-only" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Current inventory</h2>
        {active ? (
          <p style={{ margin: 0 }}>
            <b>{bookCount.toLocaleString()}</b> titles live · from{" "}
            <b>{active.source_filename ?? "CSV"}</b> · imported{" "}
            {active.activated_at ? new Date(active.activated_at).toLocaleString() : "—"}
          </p>
        ) : (
          <p style={{ margin: 0 }} className="hint">
            No inventory yet — upload the Libib CSV export below.
          </p>
        )}
      </div>

      {canImport && (
      <div
        className="card desk-only"
        style={{
          marginBottom: 20,
          borderStyle: dragOver ? "dashed" : "solid",
          borderColor: dragOver ? "#6c7ff2" : undefined,
        }}
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
        <h2 style={{ marginTop: 0 }}>Upload a new Libib export</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Libib → your library → Export → CSV. Drop the file here (or choose it). The current
          inventory stays live until the new one is fully imported, then they swap atomically.
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
          <div style={{ marginTop: 14 }}>
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
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, flex: 1 }}>Search the catalog</h2>
          {canImport && (
            <button className="btn" onClick={() => setReviewing(true)}>
              ✨ Review suggested tags
            </button>
          )}
        </div>
        {reviewing && (
          <TagReviewPanel
            onDone={() => {
              setReviewing(false);
              search();
            }}
          />
        )}
        <form onSubmit={search} className="searchrow" style={{ marginTop: 12 }}>
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
        <div className="tagpicker" style={{ marginTop: 10 }} role="radiogroup" aria-label="Filter by tag">
          <button
            type="button"
            className={`tagchip${filter === null ? " active" : ""}`}
            style={filter === null ? { background: "var(--ink)", borderColor: "var(--ink)", color: "#fff" } : undefined}
            onClick={() => setFilterAndSearch(null)}
          >
            All
          </button>
          {CATEGORY_IDS.map((id) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                className={`tagchip${active ? " active" : ""}`}
                style={active ? { background: CATEGORIES[id].color, borderColor: CATEGORIES[id].color, color: "#fff" } : undefined}
                onClick={() => setFilterAndSearch(active ? null : id)}
              >
                {!active && <span className="dot" style={{ background: CATEGORIES[id].color }} />}
                {CATEGORIES[id].label}
              </button>
            );
          })}
        </div>
        {tagError && <div className="error" style={{ marginTop: 10 }}>{tagError}</div>}
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
                    <th>Tag</th>
                    <th>Creators</th>
                    <th>ISBN-13</th>
                    <th>Copies</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((b) => (
                    <tr key={b.id}>
                      <td data-th="Title">{b.title}</td>
                      <td data-th="Tag">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                      <td data-th="Creators">{b.creators ?? "—"}</td>
                      <td data-th="ISBN-13">{b.isbn13 ?? "—"}</td>
                      <td data-th="Copies">{b.copies}</td>
                    </tr>
                  ))}
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
