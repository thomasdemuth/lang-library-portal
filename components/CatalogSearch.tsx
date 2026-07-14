"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";

type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  dedupe_key: string;
  tag: CategoryId | null;
};

/** Read-only catalog search for students & teachers, with the shelf finder. */
export default function CatalogSearch() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [finding, setFinding] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function search(e?: React.FormEvent, tagOverride?: CategoryId | null) {
    e?.preventDefault();
    setNote(null);
    const tag = tagOverride === undefined ? filter : tagOverride;
    const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}${tag ? `&tag=${tag}` : ""}`);
    const data = await res.json();
    if (res.ok) {
      setResults(data.books);
      setTotal(data.total);
      setPage(0);
    }
  }

  useEffect(() => {
    // arriving from a "new on the shelves" card prefills the query
    const preset = new URLSearchParams(window.location.search).get("q");
    if (preset) {
      setQ(preset);
      fetch(`/api/catalog?q=${encodeURIComponent(preset)}`)
        .then((r) => r.json())
        .then((d) => {
          setResults(d.books);
          setTotal(d.total);
          setPage(0);
        })
        .catch(() => {});
    } else {
      search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/catalog?q=${encodeURIComponent(q)}&page=${page + 1}${filter ? `&tag=${filter}` : ""}`
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

  async function findShelf(b: Book) {
    setFinding(b.id);
    setNote(null);
    try {
      const res = await fetch(`/api/catalog/where?key=${encodeURIComponent(b.dedupe_key)}`);
      const data = await res.json();
      if (data.found && data.shelves?.length) {
        window.location.href = `/map?shelf=${data.shelves[0].id}`;
        return;
      }
      setNote(`“${b.title}” doesn't have a shelf on the map yet — ask at the library desk.`);
    } finally {
      setFinding(null);
    }
  }

  return (
    <div className="card">
      <form onSubmit={search} className="searchrow">
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
      <div className="tagpicker" style={{ marginTop: 10 }}>
        {CATEGORY_IDS.map((id) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              className={`tagchip${active ? " active" : ""}`}
              style={active ? { background: CATEGORIES[id].color, borderColor: CATEGORIES[id].color, color: "#fff" } : undefined}
              onClick={() => {
                setFilter(active ? null : id);
                search(undefined, active ? null : id);
              }}
            >
              {!active && <span className="dot" style={{ background: CATEGORIES[id].color }} />}
              {CATEGORIES[id].label}
            </button>
          );
        })}
      </div>

      {note && <div className="notice" style={{ marginTop: 12 }}>{note}</div>}

      {results && (
        <>
          <p className="hint" style={{ marginTop: 10 }}>
            {total.toLocaleString()} {q.trim() || filter ? `match${total === 1 ? "" : "es"}` : "books"}
            {total > results.length ? ` (showing ${results.length.toLocaleString()})` : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {results.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "2px 10px",
                  padding: "10px 2px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{b.title}</span>
                <span style={{ justifySelf: "end" }}>{b.tag && <TagPill tag={b.tag} small />}</span>
                <span className="hint" style={{ margin: 0 }}>
                  {b.creators ?? "Unknown author"} · {b.copies} in the library
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ justifySelf: "end", padding: "5px 11px", fontSize: 12 }}
                  disabled={finding === b.id}
                  onClick={() => findShelf(b)}
                >
                  {finding === b.id ? "…" : "📍 Where is it?"}
                </button>
              </div>
            ))}
          </div>
          {results.length < total && (
            <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
