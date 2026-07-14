"use client";

import { useEffect, useState } from "react";
import type { CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";
import { getFavorites, isFavorite, onFavoritesChange, toggleFavorite } from "@/lib/favorites-client";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string; tag: CategoryId | null };

export type RowKind = "new" | "random" | "tag" | "because" | "loved";

/**
 * One horizontal shelf of covers. Books whose cover fails to load are
 * dropped from the row entirely (this page is a cover gallery). Each
 * card links into search; ⭐ logs "I read this", ❤️ toggles a favorite.
 * kind="because" asks the server for books like one you read — the
 * server names the seed and the row titles itself after it.
 */
export default function BookRow({
  title,
  emoji,
  kind,
  tag,
  index,
  onPoints,
}: {
  title: string;
  emoji: string;
  kind: RowKind;
  tag?: CategoryId;
  index?: number;
  onPoints?: (points: number) => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [rowTitle, setRowTitle] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [favTick, setFavTick] = useState(0); // re-render when the shared heart set changes
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ kind });
    if (tag) params.set("tag", tag);
    if (index !== undefined) params.set("i", String(index));
    fetch(`/api/catalog/row?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setBooks((d.books ?? []).filter((b: Book) => b.isbn13));
        if (d.seedTitle) setRowTitle(`Because you read “${d.seedTitle}”`);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [kind, tag, index]);

  useEffect(() => {
    getFavorites().then(() => setFavTick((n) => n + 1));
    return onFavoritesChange(() => setFavTick((n) => n + 1));
  }, []);

  function say(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2600);
  }

  async function markRead(e: React.MouseEvent, b: Book) {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/play/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key: b.dedupe_key, title: b.title }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLogged((cur) => new Set(cur).add(b.dedupe_key));
      say(`+${data.earned} ⭐ Nice reading!`);
      onPoints?.(data.points);
    } else {
      say(data.error ?? "Couldn't log that one.");
    }
  }

  async function heart(e: React.MouseEvent, b: Book) {
    e.preventDefault();
    e.stopPropagation();
    const result = await toggleFavorite({ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 });
    if ("error" in result) say(result.error);
    else if (result.favorited) say("Added to your favorites ❤️");
  }

  const visible = books.filter((b) => !hidden.has(b.id));
  if (loaded && visible.length === 0) return null;

  return (
    <div className="newshelf" data-favtick={favTick}>
      <h2>
        <span className="newshelf-spark">{emoji}</span> {rowTitle ?? title}
        {toast && <span className="row-toast">{toast}</span>}
      </h2>
      <div className="newshelf-row">
        {visible.map((b) => (
          <a key={b.id} className="newshelf-card" href={`/search?q=${encodeURIComponent(b.title)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/catalog/cover?isbn=${b.isbn13}`}
              alt=""
              loading="lazy"
              onError={() => setHidden((cur) => new Set(cur).add(b.id))}
            />
            <button
              type="button"
              className={`fav-btn${isFavorite(b.dedupe_key) ? " on" : ""}`}
              onClick={(e) => heart(e, b)}
              title={isFavorite(b.dedupe_key) ? "Remove from favorites" : "Add to favorites"}
              aria-label="Favorite"
            >
              {isFavorite(b.dedupe_key) ? "❤️" : "🤍"}
            </button>
            <span className="newshelf-title">{b.title}</span>
            <span className="newshelf-foot">
              {b.tag && <TagPill tag={b.tag} small />}
              <button
                type="button"
                className={`read-btn${logged.has(b.dedupe_key) ? " done" : ""}`}
                onClick={(e) => markRead(e, b)}
                title="I read this — earn stars!"
              >
                {logged.has(b.dedupe_key) ? "✓ logged" : "⭐ I read this"}
              </button>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
