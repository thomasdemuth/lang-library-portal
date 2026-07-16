"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";
import { Check, Heart, Pin } from "@/components/icons";
import { getFavorites, isFavorite, onFavoritesChange, toggleFavorite } from "@/lib/favorites-client";
import { fetchDetail, findShelf, logRead, type BookDetail } from "@/lib/book-actions-client";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string; tag: CategoryId | null };

export type RowKind = "new" | "random" | "tag" | "because" | "loved";

/**
 * One horizontal shelf of covers. Closed, a card is pure cover art: the
 * title sits on a bottom scrim, the genre glows from the top-right corner,
 * and ❤️ favorites from the cover. Tapping slides a white panel out to the
 * right with the genre tag, author, description, "I read this", and
 * "Where is it?". Books whose cover fails to load are dropped entirely.
 */
export default function BookRow({
  title,
  emoji,
  kind,
  tag,
  index,
  onPoints,
  hideTitle,
}: {
  title: string;
  emoji: string;
  kind: RowKind;
  tag?: CategoryId;
  index?: number;
  onPoints?: (points: number) => void;
  /** Drop the heading — used for the infinite "Keep exploring" grid, which
   *  carries a single shared title above the stack of rows. */
  hideTitle?: boolean;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [rowTitle, setRowTitle] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [favTick, setFavTick] = useState(0); // re-render when the shared heart set changes
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedW, setExpandedW] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, BookDetail | null>>({});

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

  function toggle(b: Book, el: HTMLElement) {
    setExpandedId((cur) => {
      const next = cur === b.id ? null : b.id;
      if (next !== null) {
        if (details[b.id] === undefined) {
          fetchDetail(b.dedupe_key).then((d) => setDetails((cur2) => ({ ...cur2, [b.id]: d })));
        }
        // Size the card to THIS cover: full card height at the cover's own
        // aspect ratio, plus a fixed-width panel. Explicit px keeps the
        // width transition smooth everywhere.
        const img = el.querySelector<HTMLImageElement>(".bc-cover img");
        const ratio = img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0.68;
        const coverW = Math.round(234 * Math.min(1.1, Math.max(0.45, ratio)));
        setExpandedW(coverW + 218);
        // keep the growing card in view within the horizontal scroller
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }));
      }
      return next;
    });
  }

  async function markRead(e: React.MouseEvent, b: Book) {
    e.stopPropagation();
    const result = await logRead(b);
    if ("error" in result) return say(result.error);
    setLogged((cur) => new Set(cur).add(b.dedupe_key));
    say(`+${result.earned} ⭐ Nice reading!`);
    onPoints?.(result.points);
  }

  async function heart(e: React.MouseEvent, b: Book) {
    e.stopPropagation();
    const result = await toggleFavorite({ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 });
    if ("error" in result) say(result.error);
    else if (result.favorited) say("Added to your favorites ❤️");
  }

  async function where(e: React.MouseEvent, b: Book) {
    e.stopPropagation();
    const result = await findShelf(b);
    if ("shelfId" in result) window.location.href = `/map?shelf=${result.shelfId}`;
    else say(result.message);
  }

  const visible = books.filter((b) => !hidden.has(b.id));
  if (loaded && visible.length === 0) return null;

  return (
    <div className={`newshelf${hideTitle ? " newshelf-untitled" : ""}`} data-favtick={favTick}>
      {hideTitle ? (
        toast && <span className="row-toast row-toast-float">{toast}</span>
      ) : (
        <h2>
          <span className="newshelf-spark">{emoji}</span> {rowTitle ?? title}
          {toast && <span className="row-toast">{toast}</span>}
        </h2>
      )}
      <div className="newshelf-row">
        {visible.map((b) => {
          const open = expandedId === b.id;
          const d = details[b.id];
          const coverIsbn = d?.isbn13 ?? d?.isbn10 ?? b.isbn13;
          return (
            <div
              key={b.id}
              className={`bookcard${open ? " expanded" : ""}`}
              style={open && expandedW ? { width: `min(${expandedW}px, 86vw)` } : undefined}
              onClick={(e) => toggle(b, e.currentTarget)}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(b, e.currentTarget)}
            >
              <div className="bc-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/catalog/cover?isbn=${coverIsbn}`}
                  alt=""
                  loading="lazy"
                  onError={() => setHidden((cur) => new Set(cur).add(b.id))}
                />
                {b.tag && (
                  <span
                    className="bc-glow"
                    style={{ background: `radial-gradient(circle at top right, ${CATEGORIES[b.tag].color} 0%, transparent 72%)` }}
                    aria-hidden
                  />
                )}
                <span className="bc-titlebar">
                  <span>{b.title}</span>
                </span>
              </div>

              {open && (
                <div className="bc-body">
                  <button
                    type="button"
                    className={`fav-btn bc-fav${isFavorite(b.dedupe_key) ? " on" : ""}`}
                    onClick={(e) => heart(e, b)}
                    title={isFavorite(b.dedupe_key) ? "Remove from favorites" : "Add to favorites"}
                    aria-label="Favorite"
                  >
                    <Heart filled={isFavorite(b.dedupe_key)} />
                  </button>
                  {b.tag && (
                    <span className="bc-tag">
                      <TagPill tag={b.tag} small />
                    </span>
                  )}
                  <span className="bc-title">{b.title}</span>
                  <span className="bc-author">{b.creators ?? "Unknown author"}</span>
                  {d === undefined ? (
                    <p className="hint" style={{ margin: 0 }}>Loading…</p>
                  ) : d?.description ? (
                    <p className="bc-desc">{d.description}</p>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>No description on file yet.</p>
                  )}
                  <div className="bookact">
                    <button
                      type="button"
                      className={`b-btn b-read${logged.has(b.dedupe_key) ? " done" : ""}`}
                      onClick={(e) => markRead(e, b)}
                    >
                      <Check done={logged.has(b.dedupe_key)} /> {logged.has(b.dedupe_key) ? "Logged" : "I read this"}
                    </button>
                    <button type="button" className="b-btn b-where" onClick={(e) => where(e, b)}>
                      <Pin /> Where is it?
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
