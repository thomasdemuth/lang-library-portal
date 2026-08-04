"use client";

import { useEffect, useRef, useState } from "react";
import BookRow, { type RowKind } from "@/components/BookRow";
import LetterAvatar from "@/components/LetterAvatar";
import { displayName } from "@/lib/play";
import { type CategoryId } from "@/lib/categories";
import { Ic } from "@/components/icons";

/**
 * The rotation the "Keep exploring" grid walks through. Every entry
 * resamples fresh books on each mount (random sample / random-offset category
 * slice), so rows stay varied and rarely repeat. The curated "Because you
 * read…" rows are deliberately NOT reused here — their content is fixed and
 * would repeat, which we avoid.
 *
 * v8: the grid is no longer endless. The first AUTO_ROWS rows arrive on
 * their own (one immediately, two more as the student scrolls), then an
 * explicit "Show me more books" button adds one row per press. When the
 * rotation would start repeating, an end-cap says so and points at search.
 */
const EXPLORE_KINDS: { kind: RowKind; tag?: CategoryId }[] = [
  { kind: "random" },
  { kind: "tag", tag: "fiction" },
  { kind: "tag", tag: "comics" },
  { kind: "random" },
  { kind: "tag", tag: "nonfiction" },
  { kind: "tag", tag: "young" },
  { kind: "random" },
  { kind: "tag", tag: "drama" },
];

/** 1 explore row on load + 2 auto-loaded by scrolling; the rest are asked for. */
const AUTO_ROWS = 3;
/** Past this the rotation repeats — that's the whole shelf. */
const MAX_ROWS = EXPLORE_KINDS.length;

/** The student homepage: a wall of book shelves plus quick links. */
export default function StudentHome({ email }: { email: string }) {
  const [booksThisYear, setBooksThisYear] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [extraRows, setExtraRows] = useState(1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setBooksThisYear(d.booksThisYear ?? 0);
          setPhotoUrl(d.profile.photo_url ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-load the first couple of explore rows on scroll. Re-arming on every
  // extraRows change keeps the observer honest: it only fires on transitions,
  // so re-observing forces a fresh reading each time a row lands. Unloaded
  // rows reserve height (CSS min-height), so this tops up one row at a time.
  // Once AUTO_ROWS have landed the sentinel is gone from the tree and the
  // explicit "Show me more books" button takes over (v8: no infinite scroll).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || extraRows >= AUTO_ROWS) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setExtraRows((n) => Math.min(AUTO_ROWS, n + 1));
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [extraRows]);

  const onLogged = (delta: number) => setBooksThisYear((n) => Math.max(0, (n ?? 0) + delta));

  const name = displayName(email);

  return (
    <div className="wrap student-theme">
      <div className="play-hero">
        <div className="play-me">
          <LetterAvatar name={name} size={74} src={photoUrl ?? undefined} />
          <span>
            <b>Hi, {name.split(" ")[0]}!</b>
            <span className="play-stats">
              <Ic name="book" size={12} />{" "}
              {booksThisYear === null
                ? "Tap “I read this” on any book to keep your reading log"
                : `${booksThisYear} book${booksThisYear === 1 ? "" : "s"} this year`}
            </span>
          </span>
        </div>
        <div className="play-links">
          <a href="/me"><Ic name="smile" size={16} /> My Page</a>
          <a href="/search"><Ic name="search" size={16} /> Find a Book</a>
          <a href="/map"><Ic name="map" size={16} /> Library Map</a>
          <a href="/feedback"><Ic name="feedback" size={16} /> Feedback</a>
        </div>
      </div>

      <BookRow title="Fresh picks" kind="new" onLogged={onLogged} emoji={""} />
      <BookRow title="Because you read…" kind="because" index={0} onLogged={onLogged} emoji={""} />
      <BookRow title="Class favorites" kind="loved" onLogged={onLogged} emoji={""} />
      <BookRow title="Fictional Reads" kind="tag" tag="fiction" onLogged={onLogged} emoji={""} />
      <BookRow title="True Stories" kind="tag" tag="nonfiction" onLogged={onLogged} emoji={""} />
      <BookRow title="Graphic Novels" kind="tag" tag="comics" onLogged={onLogged} emoji={""} />
      <BookRow title="Shorter Books" kind="tag" tag="young" onLogged={onLogged} emoji={""} />
      <BookRow title="Because you read…" kind="because" index={1} onLogged={onLogged} emoji={""} />
      <BookRow title="Feeling Lucky?" kind="random" onLogged={onLogged} emoji={""} />

      {/* v8: these link to OUR pages, which set expectations (OverDrive,
          library card, "ask your teacher") before anyone leaves the site. */}
      <div className="cards" style={{ marginTop: 18 }}>
        <a className="card navcard" href="/ebooks">
          <h2>
            <span className="navcard-icon" style={{ background: "#7c4dbc" }}>
              <Ic name="tablet" size={17} />
            </span>
            E-Books
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Read on a screen — see how to borrow digital books for free.</p>
        </a>
        <a className="card navcard" href="/audiobooks">
          <h2>
            <span className="navcard-icon" style={{ background: "#c2417f" }}>
              <Ic name="headphones" size={17} />
            </span>
            Audiobooks
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Stories read aloud — see how to listen for free.</p>
        </a>
      </div>

      <h2 className="explore-head"><span className="newshelf-spark"><Ic name="compass" size={17} /></span> Keep exploring</h2>
      {Array.from({ length: extraRows }, (_, i) => {
        const pick = EXPLORE_KINDS[i % EXPLORE_KINDS.length];
        return (
          <BookRow
            key={`extra-${i}`}
            title=""
            emoji=""
            hideTitle
            kind={pick.kind}
            tag={pick.tag}
            onLogged={onLogged}
          />
        );
      })}
      {extraRows < AUTO_ROWS && <div ref={sentinel} style={{ height: 1 }} />}
      {extraRows >= AUTO_ROWS && extraRows < MAX_ROWS && (
        <div className="explore-more">
          <button
            type="button"
            className="btn"
            onClick={() => setExtraRows((n) => Math.min(MAX_ROWS, n + 1))}
          >
            Show me more books
          </button>
        </div>
      )}
      {extraRows >= MAX_ROWS && (
        <p className="explore-end">
          That&rsquo;s the whole shelf! <a href="/search">Find a Book →</a>
        </p>
      )}
    </div>
  );
}
