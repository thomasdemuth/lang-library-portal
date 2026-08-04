"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CATEGORIES, pillTextClass, type CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";
import { Check, Heart, Pin } from "@/components/icons";
import { announce } from "@/components/Announcer";
import { getFavorites, isFavorite, onFavoritesChange, toggleFavorite } from "@/lib/favorites-client";
import { fetchDetail, findShelf, logRead, removeRead, shelfMapHref, type DetailResult, type NoteKind } from "@/lib/book-actions-client";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string; tag: CategoryId | null };

export type RowKind = "new" | "random" | "tag" | "because" | "loved";

/**
 * The cover is a real <button> (the disclosure control for the detail panel),
 * so it needs the browser's button chrome stripped back to what .bookcard
 * already draws. Shipped as a hoisted, de-duplicated <style href> — every
 * BookRow/GamesBrowser on the page emits it, React 19 keeps exactly one.
 * (globals.css is owned by another workstream, hence the local sheet.)
 */
export const CARD_HIT_CSS = `
.bc-hit {
  display: flex; align-items: stretch; align-self: stretch; flex: none;
  min-width: 0; margin: 0; padding: 0; border: 0; background: none;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
  -webkit-appearance: none; appearance: none; border-radius: inherit;
}
.bc-hit > .bc-cover { display: block; }
.bc-hit:focus { outline: none; }
.bc-hit:focus-visible { outline: 3px solid var(--brand-blue, #2e50c8); outline-offset: -3px; }
`;

/**
 * One horizontal shelf of covers. Closed, a card is pure cover art: the
 * title sits on a bottom scrim, the genre glows from the top-right corner,
 * and ❤️ favorites from the cover. Tapping slides a white panel out to the
 * right with the genre tag, author, description, "I read this", and
 * "Show me where". Books whose cover fails to load are dropped entirely.
 */
export default function BookRow({
  title,
  emoji,
  kind,
  tag,
  index,
  onLogged,
  hideTitle,
}: {
  title: string;
  emoji: string;
  kind: RowKind;
  tag?: CategoryId;
  index?: number;
  /** Reading-log count changed: +1 on log, -1 on undo. */
  onLogged?: (delta: number) => void;
  /** Drop the heading — used for the infinite "Keep exploring" grid, which
   *  carries a single shared title above the stack of rows. */
  hideTitle?: boolean;
}) {
  // The same book can appear in two rows on one page ("New on the shelves"
  // and "Because you read…"), so panel ids are namespaced per row instance —
  // aria-controls must point at exactly one element.
  const uid = useId();
  const [books, setBooks] = useState<Book[]>([]);
  const [rowTitle, setRowTitle] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [favTick, setFavTick] = useState(0); // re-render when the shared heart set changes
  // `undo` is the toast's one action; `undoLabel` renames it when the action
  // isn't an undo (the "Show me where" answer offers the map instead).
  const [toast, setToast] = useState<{ text: string; kind: NoteKind; undo?: () => void; undoLabel?: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedW, setExpandedW] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, DetailResult>>({});

  // ── Shelf chevrons (W4-C2) ─────────────────────────────────────────────
  // The row's scrollbar is hidden by design, so visible prev/next buttons
  // are the only pointer affordance for overflow. `chev` tracks whether
  // each direction has anywhere to go; both false ⇒ no overflow ⇒ no
  // buttons at all. Re-measured on scroll, resize, cover loads, and row
  // content changes (covers that fail to load are dropped from the row).
  const rowRef = useRef<HTMLDivElement>(null);
  const [chev, setChev] = useState({ prev: false, next: false });
  const updateChev = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const prev = el.scrollLeft > 4;
    const next = el.scrollLeft < max - 4;
    setChev((cur) => (cur.prev === prev && cur.next === next ? cur : { prev, next }));
  }, []);
  useEffect(() => {
    updateChev();
    window.addEventListener("resize", updateChev);
    return () => window.removeEventListener("resize", updateChev);
  }, [updateChev, books, hidden, expandedId]);
  /** Page the shelf by ~80% of its visible width. */
  function scrollRow(dir: 1 | -1) {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

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

  function say(text: string, kind: NoteKind = "ok", undo?: () => void, undoLabel?: string) {
    const next = { text, kind, undo, undoLabel };
    setToast(next);
    announce(text, kind === "err"); // screen readers hear every toast; errors interrupt
    setTimeout(() => setToast((cur) => (cur === next ? null : cur)), undo ? 5000 : 2600);
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
    if ("error" in result) return say(result.error, result.kind);
    setLogged((cur) => new Set(cur).add(b.dedupe_key));
    onLogged?.(1);
    const { id } = result;
    say(result.message, "ok", id === null ? undefined : () => undoRead(b, id));
  }

  async function undoRead(b: Book, id: number) {
    const result = await removeRead(id);
    if ("error" in result) return say(result.error, result.kind);
    setLogged((cur) => {
      const next = new Set(cur);
      next.delete(b.dedupe_key);
      return next;
    });
    onLogged?.(-1);
    say("Removed from your log", "info");
  }

  async function heart(e: React.MouseEvent, b: Book) {
    e.stopPropagation();
    const result = await toggleFavorite({ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 });
    if ("error" in result) say(result.error, result.kind);
    else if (result.favorited) say("Added to your favorites!");
  }

  async function where(e: React.MouseEvent, b: Book) {
    e.stopPropagation();
    const result = await findShelf(b);
    if (!("shelfId" in result)) return say(result.message, result.kind);
    const go = () => {
      window.location.href = shelfMapHref(result);
    };
    // Sure of the shelf → straight to it. Only narrowed to a category → say
    // so first, and let the student choose to walk the section on the map.
    if (result.message) say(result.message, "info", go, "Show me the shelves");
    else go();
  }

  const visible = books.filter((b) => !hidden.has(b.id));
  if (loaded && visible.length === 0) return null;

  return (
    <div className={`newshelf${hideTitle ? " newshelf-untitled" : ""}`} data-favtick={favTick}>
      <style href="bookcard-hit" precedence="default">{CARD_HIT_CSS}</style>
      {hideTitle ? (
        toast && (
          <span className={`row-toast row-toast-float${toast.kind === "ok" ? "" : ` ${toast.kind}`}`}>
            {toast.text}
            {toast.undo && (
              <button type="button" className="toast-undo" onClick={toast.undo}>
                {toast.undoLabel ?? "Undo"}
              </button>
            )}
          </span>
        )
      ) : (
        <h2>
          <span className="newshelf-spark">{emoji}</span> {rowTitle ?? title}
          {toast && (
            <span className={`row-toast${toast.kind === "ok" ? "" : ` ${toast.kind}`}`}>
              {toast.text}
              {toast.undo && (
                <button type="button" className="toast-undo" onClick={toast.undo}>
                  Undo
                </button>
              )}
            </span>
          )}
        </h2>
      )}
      <div className="shelf-scroller">
        {(chev.prev || chev.next) && (
          <>
            <button
              type="button"
              className="shelf-chev prev"
              aria-label={`Scroll ${(rowTitle ?? title) || "this shelf"} back`}
              disabled={!chev.prev}
              onClick={() => scrollRow(-1)}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className="shelf-chev next"
              aria-label={`Scroll ${(rowTitle ?? title) || "this shelf"} forward`}
              disabled={!chev.next}
              onClick={() => scrollRow(1)}
            >
              <span aria-hidden>›</span>
            </button>
          </>
        )}
        <div className="newshelf-row" ref={rowRef} onScroll={updateChev}>
        {visible.map((b) => {
          const open = expandedId === b.id;
          const d = details[b.id];
          const book = d && "book" in d ? d.book : null;
          const coverIsbn = book?.isbn13 ?? book?.isbn10 ?? b.isbn13;
          return (
            <div
              key={b.id}
              className={`bookcard${open ? " expanded" : ""}`}
              style={open && expandedW ? { width: `min(${expandedW}px, 86vw)` } : undefined}
            >
              {/* The cover IS the disclosure button. Nothing interactive nests
                  inside it — the panel below is a sibling, so its buttons are
                  their own tab stops and Enter/Space no longer bubbles here. */}
              <button
                type="button"
                className="bc-hit"
                aria-expanded={open}
                aria-controls={`${uid}-panel-${b.id}`}
                onClick={(e) => toggle(b, e.currentTarget.closest(".bookcard") as HTMLElement)}
              >
                <span className="bc-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/catalog/cover?isbn=${coverIsbn}`}
                    alt=""
                    loading="lazy"
                    onLoad={updateChev}
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
                </span>
              </button>

              {open && (
                <div className="bc-body" id={`${uid}-panel-${b.id}`}>
                  <button
                    type="button"
                    className={`fav-btn bc-fav${isFavorite(b.dedupe_key) ? " on" : ""}`}
                    onClick={(e) => heart(e, b)}
                    title={isFavorite(b.dedupe_key) ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFavorite(b.dedupe_key)}
                    aria-label={
                      isFavorite(b.dedupe_key)
                        ? `Remove ${b.title} from favorites`
                        : `Add ${b.title} to favorites`
                    }
                  >
                    <Heart filled={isFavorite(b.dedupe_key)} />
                  </button>
                  {b.tag && (
                    <span className="bc-tag">
                      <TagPill tag={b.tag} small className={pillTextClass(b.tag)} />
                    </span>
                  )}
                  <span className="bc-title">{b.title}</span>
                  <span className="bc-author">{b.creators ?? "Unknown author"}</span>
                  {d === undefined ? (
                    <p className="hint" style={{ margin: 0 }}>Loading…</p>
                  ) : "error" in d ? (
                    <p className="hint" style={{ margin: 0 }}>{d.error}</p>
                  ) : book?.description ? (
                    <p className="bc-desc">{book.description}</p>
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
                      <Pin /> Show me where
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
