"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";
import { getFavorites, isFavorite, onFavoritesChange, toggleFavorite } from "@/lib/favorites-client";
import { fetchDetail, findShelf, logRead, type BookDetail } from "@/lib/book-actions-client";

type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  dedupe_key: string;
  tag: CategoryId | null;
};

/** Read-only catalog search for students & teachers. Tap a book to open its
 *  cover, description, and actions (favorite / I read this / where is it). */
export default function CatalogSearch() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, BookDetail | null>>({});
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [favTick, setFavTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  async function search(e?: React.FormEvent, tagOverride?: CategoryId | null) {
    e?.preventDefault();
    setNote(null);
    setExpandedId(null);
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
    getFavorites().then(() => setFavTick((n) => n + 1));
    return onFavoritesChange(() => setFavTick((n) => n + 1));
  }, []);

  useEffect(() => {
    // arriving from a discovery card prefills the query
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

  function say(text: string) {
    setNote(text);
    setTimeout(() => setNote((cur) => (cur === text ? null : cur)), 3200);
  }

  function toggle(b: Book) {
    setExpandedId((cur) => {
      const next = cur === b.id ? null : b.id;
      if (next !== null && details[b.id] === undefined) {
        fetchDetail(b.dedupe_key).then((d) => setDetails((cur2) => ({ ...cur2, [b.id]: d })));
      }
      return next;
    });
  }

  async function markRead(b: Book) {
    const result = await logRead(b);
    if ("error" in result) return say(result.error);
    setLogged((cur) => new Set(cur).add(b.dedupe_key));
    say(`+${result.earned} ⭐ Nice reading!`);
  }

  async function heart(b: Book) {
    const result = await toggleFavorite({ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 });
    if ("error" in result) say(result.error);
    else say(result.favorited ? "Added to your favorites ❤️" : "Removed from favorites");
  }

  async function where(b: Book) {
    setNote(null);
    const result = await findShelf(b);
    if ("shelfId" in result) window.location.href = `/map?shelf=${result.shelfId}`;
    else say(result.message);
  }

  return (
    <div className="card" data-favtick={favTick}>
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
          <div className="catlist">
            {results.map((b) => {
              const open = expandedId === b.id;
              const d = details[b.id];
              const coverIsbn = d?.isbn13 ?? b.isbn13;
              return (
                <div key={b.id} className={`catrow${open ? " open" : ""}`}>
                  <button type="button" className="catrow-head" onClick={() => toggle(b)} aria-expanded={open}>
                    <span className="catrow-main">
                      <span className="catrow-title">{b.title}</span>
                      <span className="catrow-meta">
                        {b.creators ?? "Unknown author"} · {b.copies} in the library
                      </span>
                    </span>
                    {b.tag && <TagPill tag={b.tag} small />}
                    <span className={`catrow-chev${open ? " open" : ""}`} aria-hidden>
                      ›
                    </span>
                  </button>

                  {open && (
                    <div className="catrow-detail">
                      <div className="bookdetail">
                        {coverIsbn && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="bookcover"
                            src={`/api/catalog/cover?isbn=${coverIsbn}`}
                            alt=""
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {d === undefined ? (
                            <p className="hint" style={{ marginTop: 0 }}>Loading…</p>
                          ) : d?.description ? (
                            <p className="bookdesc">{d.description}</p>
                          ) : (
                            <p className="hint" style={{ marginTop: 0 }}>No description on file yet.</p>
                          )}
                          <div className="bookact">
                            <button
                              type="button"
                              className={`b-btn b-fav${isFavorite(b.dedupe_key) ? " on" : ""}`}
                              onClick={() => heart(b)}
                            >
                              {isFavorite(b.dedupe_key) ? "❤️ Favorited" : "🤍 Favorite"}
                            </button>
                            <button
                              type="button"
                              className={`b-btn b-read${logged.has(b.dedupe_key) ? " done" : ""}`}
                              onClick={() => markRead(b)}
                            >
                              {logged.has(b.dedupe_key) ? "✓ logged" : "⭐ I read this"}
                            </button>
                            <button type="button" className="b-btn b-where" onClick={() => where(b)}>
                              📍 Where is it?
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
