"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_IDS,
  pillTextClass,
  TEACHERS_COLOR,
  type CategoryId,
} from "@/lib/categories";
import { TagPill, TeachersPill } from "@/components/TagPicker";
import { Check, Heart, Pin } from "@/components/icons";
import AddToCollection from "@/components/AddToCollection";
import LibraryMap from "@/components/map/LibraryMap";
import { announce } from "@/components/Announcer";
import { getFavorites, isFavorite, onFavoritesChange, toggleFavorite } from "@/lib/favorites-client";
import {
  fetchDetail,
  findShelf,
  logRead,
  removeRead,
  shelfMapHref,
  type DetailResult,
  type NoteKind,
  type ShelfResult,
} from "@/lib/book-actions-client";
import { checkOut } from "@/lib/checkout-client";
import { fireConfetti, fireHearts } from "@/lib/confetti";
import { bumpRead, readCount, refreshBadges } from "@/lib/badges-client";
import { praiseForRead } from "@/lib/praise";
import StaffCheckout from "@/components/StaffCheckout";
import { withBase } from "@/lib/base";

type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  dedupe_key: string;
  tag: CategoryId | null;
  /** Only ever true for staff and management — students never receive these. */
  teachers?: boolean;
};

/**
 * Catalog search, shared by the student and staff portals. Tap a book to
 * open its cover, description, and location. The `role` prop gates the
 * student-only features — favorite hearts, the "I read this" reading log,
 * and add-to-collection; staff get search, results, and "Show me where"
 * only, and guests (no account) get the same plus a quiet sign-in nudge.
 * Everything else is identical.
 */
export default function CatalogSearch({
  role = "student",
  teachersOnly = false,
}: {
  role?: "student" | "staff" | "guest";
  /** Books for Teachers: list ONLY the books marked for teachers. The API
   *  refuses this for students, so it is never a way around the rule. */
  teachersOnly?: boolean;
}) {
  const isStudent = role === "student";
  // Staff can narrow a search to the teachers' collection. The chip is a
  // sibling of the category chips rather than one of them: Teachers is a flag
  // a book carries, not a seventh category, so a book can match both.
  const canFilterTeachers = role === "staff" && !teachersOnly;
  // aria-expanded on its own leaves a screen reader to guess which region the
  // row controls — namespaced per instance so the id is unique even when two
  // catalogs render on one page.
  const uid = useId();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [teachersFilter, setTeachersFilter] = useState(false);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, DetailResult>>({});
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [borrowed, setBorrowed] = useState<Set<string>>(new Set());
  const [favTick, setFavTick] = useState(0);
  // `undo` is the notice's one action; `undoLabel` renames it when the action
  // isn't an undo (the "Show me where" answer offers the map instead).
  const [note, setNote] = useState<{ text: string; kind: NoteKind; undo?: () => void; undoLabel?: string } | null>(null);

  // ── Find-a-Book split view (W4-C2, student surface, ≥900px) ────────────
  // Desktop puts the results beside a compact read-only library map; a
  // book's shelf lights up there instead of navigating away. Staff keep
  // the plain list (their pages aren't part of this pass). Shelf lookups
  // are cached per book and fired only when a result is expanded (the
  // moment the detail fetch already runs) — never per hover.
  const [splitView, setSplitView] = useState(false);
  const [mapShelf, setMapShelf] = useState<string | null>(null);
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const shelfCache = useRef<Map<string, ShelfResult>>(new Map());

  useEffect(() => {
    if (role === "staff") return;
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setSplitView(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [role]);

  /** One where-lookup per book, remembered (failures stay retryable). */
  async function lookupShelf(b: Book): Promise<ShelfResult> {
    const cached = shelfCache.current.get(b.dedupe_key);
    if (cached) return cached;
    const result = await findShelf(b);
    if ("shelfId" in result || result.kind === "info") shelfCache.current.set(b.dedupe_key, result);
    return result;
  }

  async function search(
    e?: React.FormEvent,
    tagOverride?: CategoryId | null,
    teachersOverride?: boolean
  ) {
    e?.preventDefault();
    setNote(null);
    setExpandedId(null);
    const tag = tagOverride === undefined ? filter : tagOverride;
    const onlyTeachers = teachersOverride === undefined ? teachersFilter : teachersOverride;
    const scope = teachersOnly || onlyTeachers ? "&teachers=only" : "";
    const res = await fetch(withBase(`/api/catalog?q=${encodeURIComponent(q)}${tag ? `&tag=${tag}` : ""}${scope}`));
    const data = await res.json();
    if (res.ok) {
      setResults(data.books);
      setTotal(data.total);
      setPage(0);
    }
  }

  useEffect(() => {
    if (!isStudent) return; // favorites are a student-only feature
    getFavorites().then(() => setFavTick((n) => n + 1));
    return onFavoritesChange(() => setFavTick((n) => n + 1));
  }, [isStudent]);

  useEffect(() => {
    // arriving from a discovery card prefills the query
    const preset = new URLSearchParams(window.location.search).get("q");
    if (preset) {
      setQ(preset);
      fetch(withBase(`/api/catalog?q=${encodeURIComponent(preset)}`))
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
        withBase(
          `/api/catalog?q=${encodeURIComponent(q)}&page=${page + 1}${filter ? `&tag=${filter}` : ""}${
            teachersOnly || teachersFilter ? "&teachers=only" : ""
          }`
        )
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

  function say(text: string, kind: NoteKind = "ok", undo?: () => void, undoLabel?: string) {
    const next = { text, kind, undo, undoLabel };
    setNote(next);
    announce(text, kind === "err"); // screen readers hear every notice; errors interrupt
    setTimeout(() => setNote((cur) => (cur === next ? null : cur)), undo ? 5000 : 3200);
  }

  function toggle(b: Book) {
    setExpandedId((cur) => {
      const next = cur === b.id ? null : b.id;
      if (next !== null && details[b.id] === undefined) {
        fetchDetail(b.dedupe_key).then((d) => setDetails((cur2) => ({ ...cur2, [b.id]: d })));
      }
      // Split view: expanding is the moment we already pay for a detail
      // fetch, so piggyback the one shelf lookup and light up the mini-map
      // — but only when the answer is certain. An uncertain area match
      // waits for "Show me where", which explains itself honestly first.
      if (next !== null && splitView) {
        lookupShelf(b).then((r) => {
          if ("shelfId" in r && r.certain) setMapShelf(r.shelfId);
        });
      }
      return next;
    });
  }

  async function markRead(b: Book) {
    const result = await logRead(b);
    if ("error" in result) return say(result.error, result.kind);
    setLogged((cur) => new Set(cur).add(b.dedupe_key));
    if (isStudent) {
      fireConfetti(30);
      bumpRead(1);
      refreshBadges();
    }
    const { id } = result;
    // Students get the warm, counting line; staff keep the plain confirmation.
    const total = isStudent ? readCount() : 0;
    say(total > 0 ? praiseForRead(total) : result.message, "ok", id === null ? undefined : () => undoRead(b, id));
  }

  async function undoRead(b: Book, id: number) {
    const result = await removeRead(id);
    if ("error" in result) return say(result.error, result.kind);
    setLogged((cur) => {
      const next = new Set(cur);
      next.delete(b.dedupe_key);
      return next;
    });
    if (isStudent) bumpRead(-1);
    say("Removed from your log", "info");
  }

  async function borrow(b: Book) {
    const result = await checkOut(b);
    if ("error" in result) {
      // Already-out is still "you have it" — reflect that on the button.
      if (result.kind === "warn") setBorrowed((cur) => new Set(cur).add(b.dedupe_key));
      return say(result.error, result.kind);
    }
    setBorrowed((cur) => new Set(cur).add(b.dedupe_key));
    if (isStudent) {
      fireConfetti();
      refreshBadges();
    }
    say([result.message, ...result.warnings].join(" "), result.warnings.length ? "warn" : "ok");
  }

  async function heart(e: React.MouseEvent, b: Book) {
    // Read the button's position before awaiting — the card can re-render
    // while the POST is in flight.
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const result = await toggleFavorite({ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 });
    if ("error" in result) return say(result.error, result.kind);
    if (result.favorited && isStudent) {
      // Only on the way in — un-hearting is a correction, not a moment.
      fireHearts({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      refreshBadges();
    }
    say(result.favorited ? "Added to your favorites!" : "Removed from favorites");
  }

  async function where(b: Book) {
    setNote(null);
    const result = await lookupShelf(b);
    if (!("shelfId" in result)) return say(result.message, result.kind);
    // Split view visible → light the shelf up on the mini-map right here
    // (and make sure the map is on screen) instead of navigating away.
    if (splitView) {
      const show = () => {
        setMapShelf(result.shelfId);
        mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      if (result.message) say(result.message, "info", show, "Show me the shelves");
      else show();
      return;
    }
    const go = () => {
      window.location.href = shelfMapHref(result);
    };
    // Sure of the shelf → straight to it. Only narrowed to a category → say
    // so first, and let the reader choose to walk the section on the map.
    if (result.message) say(result.message, "info", go, "Show me the shelves");
    else go();
  }

  return (
    <div className={splitView ? "findbook-split" : undefined}>
    <div className="card" data-favtick={favTick}>
      <form onSubmit={search} className="searchrow">
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          aria-label="Search the library"
          placeholder="Search every book — title or author…"
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
            // v8: the category pills carry the library's own shelf colors at
            // all times — they are the color on this page. Picking one dims
            // the rest and rings the chosen one, so filter state stays legible
            // without draining the palette.
            <button
              key={id}
              type="button"
              aria-pressed={active}
              className={`tagchip cat-chip ${pillTextClass(id)}${active ? " active" : ""}`}
              style={{ background: CATEGORIES[id].color, borderColor: CATEGORIES[id].color }}
              onClick={() => {
                setFilter(active ? null : id);
                search(undefined, active ? null : id);
              }}
            >
              {CATEGORIES[id].label}
            </button>
          );
        })}
        {canFilterTeachers && (
          <button
            type="button"
            aria-pressed={teachersFilter}
            className={`tagchip${teachersFilter ? ` active ${pillTextClass("teachers")}` : ""}`}
            style={
              teachersFilter
                ? { background: TEACHERS_COLOR, borderColor: TEACHERS_COLOR, color: "#fff" }
                : undefined
            }
            title="Only the books kept out of the students' library"
            onClick={() => {
              const next = !teachersFilter;
              setTeachersFilter(next);
              search(undefined, undefined, next);
            }}
          >
            {!teachersFilter && <span className="dot" style={{ background: TEACHERS_COLOR }} />}
            Teachers
          </button>
        )}
      </div>

      {note && (
        <div className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`} style={{ marginTop: 12 }}>
          {note.text}
          {note.undo && (
            <button type="button" className="toast-undo" onClick={note.undo}>
              {note.undoLabel ?? "Undo"}
            </button>
          )}
        </div>
      )}

      {results && (
        <>
          <p className="hint" style={{ marginTop: 10 }}>
            {total.toLocaleString()}{" "}
            {q.trim() || filter || teachersFilter ? `match${total === 1 ? "" : "es"}` : "books"}
            {total > results.length ? ` (showing ${results.length.toLocaleString()})` : ""}
          </p>
          <div className="catlist">
            {results.map((b) => {
              const open = expandedId === b.id;
              const d = details[b.id];
              const book = d && "book" in d ? d.book : null;
              const coverIsbn = book?.isbn13 ?? b.isbn13;
              return (
                <div key={b.id} className={`catrow${open ? " open" : ""}`}>
                  <button
                    type="button"
                    className="catrow-head"
                    onClick={() => toggle(b)}
                    aria-expanded={open}
                    aria-controls={`${uid}-detail-${b.id}`}
                  >
                    <span className="catrow-main">
                      <span className="catrow-title">{b.title}</span>
                      <span className="catrow-meta">
                        {b.creators ?? "Unknown author"} · {b.copies} in the library
                      </span>
                    </span>
                    {b.tag && <TagPill tag={b.tag} small className={pillTextClass(b.tag)} />}
                    {b.teachers && <TeachersPill small />}
                    <span className={`catrow-chev${open ? " open" : ""}`} aria-hidden>
                      ›
                    </span>
                  </button>

                  {open && (
                    <div className="catrow-detail" id={`${uid}-detail-${b.id}`}>
                      <div className="bookdetail">
                        {coverIsbn && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="bookcover"
                            src={withBase(`/api/catalog/cover?isbn=${coverIsbn}`)}
                            alt=""
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {d === undefined ? (
                            <p className="hint" style={{ marginTop: 0 }}>Loading…</p>
                          ) : "error" in d ? (
                            <p className="hint" style={{ marginTop: 0 }}>{d.error}</p>
                          ) : book?.description ? (
                            <p className="bookdesc">{book.description}</p>
                          ) : (
                            <p className="hint" style={{ marginTop: 0 }}>No description on file yet.</p>
                          )}
                          <div className="bookact">
                            {isStudent && (
                              <button
                                type="button"
                                className={`b-btn b-fav${isFavorite(b.dedupe_key) ? " on" : ""}`}
                                onClick={(e) => heart(e, b)}
                                aria-pressed={isFavorite(b.dedupe_key)}
                              >
                                <Heart filled={isFavorite(b.dedupe_key)} size={13} />
                                {isFavorite(b.dedupe_key) ? "Favorited" : "Favorite"}
                              </button>
                            )}
                            {isStudent && (
                              <button
                                type="button"
                                className={`b-btn b-read${logged.has(b.dedupe_key) ? " done" : ""}`}
                                onClick={() => markRead(b)}
                              >
                                <Check done={logged.has(b.dedupe_key)} /> {logged.has(b.dedupe_key) ? "Logged" : "I read this"}
                              </button>
                            )}
                            {isStudent && (
                              <button
                                type="button"
                                className={`b-btn b-read${borrowed.has(b.dedupe_key) ? " done" : ""}`}
                                onClick={() => borrow(b)}
                                disabled={borrowed.has(b.dedupe_key)}
                              >
                                <Check done={borrowed.has(b.dedupe_key)} />{" "}
                                {borrowed.has(b.dedupe_key) ? "Checked out" : "Check out"}
                              </button>
                            )}
                            <button type="button" className="b-btn b-where" onClick={() => where(b)}>
                              <Pin /> Show me where
                            </button>
                            {isStudent && (
                              <AddToCollection book={{ book_key: b.dedupe_key, title: b.title, isbn13: b.isbn13 }} />
                            )}
                            {role === "staff" && (
                              <StaffCheckout
                                book={{ title: b.title, dedupe_key: b.dedupe_key, isbn13: b.isbn13 }}
                                onNote={(text, kind) => say(text, kind)}
                              />
                            )}
                            {role === "guest" && (
                              <a className="hint" style={{ margin: 0, alignSelf: "center" }} href={withBase("/api/auth/google/start")}>
                                Sign in with Google to save favorites
                              </a>
                            )}
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

      {/* Desktop split view: the compact, read-only mini-map the results
          talk to. Mobile keeps the navigate-to-/map behavior instead. */}
      {splitView && (
        <div className="findbook-map" ref={mapPanelRef}>
          <LibraryMap editable={false} highlightShelfId={mapShelf} />
        </div>
      )}
    </div>
  );
}
