"use client";

import { useEffect, useRef, useState } from "react";
import { Ic, Pencil } from "@/components/icons";

type CollectionBook = { book_key: string; title: string; isbn13: string | null };
type Collection = { id: number; name: string; books: CollectionBook[] };
type SearchHit = { dedupe_key: string; title: string; creators: string | null; isbn13: string | null };

/**
 * My collections: student-built book lists (like playlists). Create, rename,
 * delete; fill each one with a built-in catalog search. Collections with
 * books in them show on the student's public page.
 */
export default function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [migration, setMigration] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [hiddenCovers, setHiddenCovers] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/play/collections")
      .then((r) => r.json())
      .then((d) => {
        setCollections(d.collections ?? []);
        setMigration(Boolean(d.migrationPending));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function say(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3200);
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const res = await fetch("/api/play/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say((data as { error?: string }).error ?? "Couldn't save that.");
      return null;
    }
    return data;
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const data = await post({ action: "create", name });
    if (!data) return;
    const col = data.collection as Collection;
    setCollections((cur) => [...cur, col]);
    setNewName("");
    setOpenId(col.id);
    setQuery("");
    setHits([]);
  }

  async function rename(id: number) {
    const name = renameDraft.trim();
    setRenaming(null);
    if (!name) return;
    if (await post({ action: "rename", id, name })) {
      setCollections((cur) => cur.map((c) => (c.id === id ? { ...c, name } : c)));
    }
  }

  async function remove(col: Collection) {
    if (!window.confirm(`Delete “${col.name}”? The books stay in the library — just this list goes away.`)) return;
    if (await post({ action: "delete", id: col.id })) {
      setCollections((cur) => cur.filter((c) => c.id !== col.id));
      if (openId === col.id) setOpenId(null);
    }
  }

  async function addBook(col: Collection, hit: SearchHit) {
    if (col.books.some((b) => b.book_key === hit.dedupe_key)) return say("That book's already in this collection.");
    const book = { book_key: hit.dedupe_key, title: hit.title, isbn13: hit.isbn13 };
    if (await post({ action: "add", id: col.id, book })) {
      setCollections((cur) => cur.map((c) => (c.id === col.id ? { ...c, books: [...c.books, book] } : c)));
    }
  }

  async function removeBook(col: Collection, book_key: string) {
    if (await post({ action: "remove", id: col.id, book_key })) {
      setCollections((cur) =>
        cur.map((c) => (c.id === col.id ? { ...c, books: c.books.filter((b) => b.book_key !== book_key) } : c))
      );
    }
  }

  function search(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) return setHits([]);
    searchTimer.current = setTimeout(() => {
      fetch(`/api/catalog?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => setHits(((d.books ?? []) as SearchHit[]).slice(0, 8)))
        .catch(() => {});
    }, 300);
  }

  function toggleOpen(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    setQuery("");
    setHits([]);
    setRenaming(null);
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>
        <Ic name="folder" size={16} /> My collections
      </h2>
      {migration ? (
        <p className="hint">Collections unlock after the next library update — check back soon!</p>
      ) : (
        <>
          {msg && <div className="error">{msg}</div>}

          <div className="coll-new">
            <input
              className="input"
              placeholder="Start a collection — “Dragons”, “Summer reads”…"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button type="button" className="btn" onClick={create} disabled={!newName.trim()}>
              Create
            </button>
          </div>

          {loaded && collections.length === 0 && (
            <p className="hint" style={{ marginBottom: 0 }}>
              Build your own book lists — friends can see them on your page once they have books inside.
            </p>
          )}

          {collections.map((col) => (
            <div key={col.id} className={`coll${openId === col.id ? " open" : ""}`}>
              <button type="button" className="coll-head" onClick={() => toggleOpen(col.id)}>
                <Ic name="folder" size={15} />
                <b>{col.name}</b>
                <span className="hint" style={{ margin: 0 }}>
                  {col.books.length} book{col.books.length === 1 ? "" : "s"}
                </span>
                <span className="coll-chev" aria-hidden>{openId === col.id ? "▾" : "▸"}</span>
              </button>

              {openId === col.id && (
                <div className="coll-body">
                  <div className="coll-tools">
                    {renaming === col.id ? (
                      <>
                        <input
                          className="input"
                          value={renameDraft}
                          maxLength={40}
                          autoFocus
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") rename(col.id);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                        />
                        <button type="button" className="btn" onClick={() => rename(col.id)}>Save</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => {
                          setRenaming(col.id);
                          setRenameDraft(col.name);
                        }}
                      >
                        <Pencil size={12} /> rename
                      </button>
                    )}
                    <button type="button" className="linklike danger" onClick={() => remove(col)}>
                      delete collection
                    </button>
                  </div>

                  {col.books.filter((b) => b.isbn13 && !hiddenCovers.has(b.book_key)).length > 0 && (
                    <div className="fav-wall">
                      {col.books
                        .filter((b) => b.isbn13 && !hiddenCovers.has(b.book_key))
                        .map((b) => (
                          <a key={b.book_key} className="fav-cover" href={`/search?q=${encodeURIComponent(b.title)}`} title={b.title}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/catalog/cover?isbn=${b.isbn13}`}
                              alt={b.title}
                              loading="lazy"
                              onError={() => setHiddenCovers((cur) => new Set(cur).add(b.book_key))}
                            />
                          </a>
                        ))}
                    </div>
                  )}
                  {col.books.length > 0 && (
                    <div className="leader-rows" style={{ marginTop: 10 }}>
                      {col.books.map((b) => (
                        <div key={b.book_key} className="leader-row">
                          <Ic name="book" size={14} />
                          <b style={{ flex: 1 }}>{b.title}</b>
                          <button type="button" className="linklike" onClick={() => removeBook(col, b.book_key)}>
                            remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="coll-add">
                    <input
                      className="input"
                      placeholder="Add books — search the library…"
                      value={query}
                      onChange={(e) => search(e.target.value)}
                    />
                    {hits.length > 0 && (
                      <div className="coll-hits">
                        {hits.map((h) => {
                          const inCol = col.books.some((b) => b.book_key === h.dedupe_key);
                          return (
                            <button
                              key={h.dedupe_key}
                              type="button"
                              className="coll-hit"
                              disabled={inCol}
                              onClick={() => addBook(col, h)}
                            >
                              <b>{h.title}</b>
                              <span className="hint" style={{ margin: 0 }}>{h.creators ?? "Unknown author"}</span>
                              <span className="coll-hit-add">{inCol ? "added ✓" : "+ add"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
