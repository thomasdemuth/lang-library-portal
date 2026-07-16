"use client";

import { useEffect, useRef, useState } from "react";
import BookRow from "@/components/BookRow";
import AvatarView from "@/components/AvatarView";
import { DEFAULT_AVATAR, displayName, type Avatar } from "@/lib/play";
import { Ic } from "@/components/icons";

type Leader = { rank: number; name: string; books: number; avatar: Avatar; id: string | null };

const MEDALS = ["🥇", "🥈", "🥉"];

/** The student homepage: a wall of book shelves plus the reading game. */
export default function StudentHome({ email }: { email: string }) {
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [points, setPoints] = useState<number | null>(null);
  const [booksRead, setBooksRead] = useState(0);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [extraRows, setExtraRows] = useState(1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setAvatar({ ...DEFAULT_AVATAR, ...d.profile.avatar });
          setPoints(d.profile.points);
          setBooksRead(d.booksRead ?? 0);
        }
      })
      .catch(() => {});
    fetch("/api/play/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaders(d.leaders ?? []))
      .catch(() => {});
  }, []);

  // Infinite shelves: every time the bottom sentinel shows, add a row.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setExtraRows((n) => Math.min(n + 1, 12));
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onPoints = (p: number) => {
    setPoints(p);
    setBooksRead((n) => n + 1);
  };

  return (
    <div className="wrap student-theme">
      <div className="play-hero">
        <a className="play-me" href="/me">
          <AvatarView avatar={avatar} size={74} />
          <span>
            <b>Hi, {displayName(email)}!</b>
            <span className="play-stats">
              {points !== null ? (
                <>
                  ⭐ {points} stars · 📖 {booksRead} book{booksRead === 1 ? "" : "s"} logged
                </>
              ) : (
                "Read books, earn stars, build your avatar"
              )}
            </span>
            <span className="play-cta">Customize your avatar →</span>
          </span>
        </a>
        <div className="play-links">
          <a href="/search"><Ic name="search" size={16} /> Find a Book</a>
          <a href="/map"><Ic name="map" size={16} /> Library Map</a>
          <a href="/feedback"><Ic name="feedback" size={16} /> Feedback</a>
        </div>
      </div>

      <BookRow title="Fresh picks" kind="new" onPoints={onPoints} emoji={""} />
      <BookRow title="Because you read…" kind="because" index={0} onPoints={onPoints} emoji={""} />
      <BookRow title="Class favorites" kind="loved" onPoints={onPoints} emoji={""} />
      <BookRow title="Fictional Reads" kind="tag" tag="fiction" onPoints={onPoints} emoji={""} />
      <BookRow title="True Stories" kind="tag" tag="nonfiction" onPoints={onPoints} emoji={""} />
      <BookRow title="Graphic Novels" kind="tag" tag="comics" onPoints={onPoints} emoji={""} />
      <BookRow title="Shorter Books" kind="tag" tag="young" onPoints={onPoints} emoji={""} />
      <BookRow title="Because you read…" kind="because" index={1} onPoints={onPoints} emoji={""} />
      <BookRow title="Feeling Lucky?" kind="random" onPoints={onPoints} emoji={""} />

      {leaders.length > 0 && (
        <div className="card leaderboard">
          <h2>🏆 Top readers</h2>
          <div className="leader-rows">
            {leaders.map((l) => {
              const inner = (
                <>
                  <span className="leader-rank">{MEDALS[l.rank - 1] ?? `#${l.rank}`}</span>
                  <AvatarView avatar={l.avatar} size={38} />
                  <b>{l.name}</b>
                  <span className="leader-books">
                    {l.books} book{l.books === 1 ? "" : "s"}
                  </span>
                </>
              );
              return l.id ? (
                <a key={l.rank} className="leader-row tappable" href={`/students/${l.id}`} title={`See ${l.name}'s favorites`}>
                  {inner}
                </a>
              ) : (
                <div key={l.rank} className="leader-row">{inner}</div>
              );
            })}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Tap ⭐ “I read this” to climb the board — tap a reader to see their favorites.
          </p>
        </div>
      )}

      <div className="cards" style={{ marginTop: 18 }}>
        <a className="card navcard" href="https://nypl.overdrive.com/" target="_blank" rel="noopener noreferrer">
          <h2>
            <span className="navcard-icon" style={{ background: "#7c4dbc" }}>
              <Ic name="book" size={17} />
            </span>
            E-Books
            <span className="navcard-arrow" aria-hidden>↗</span>
          </h2>
          <p>Read on a screen — borrow digital books through OverDrive.</p>
        </a>
        <a className="card navcard" href="https://nypl.overdrive.com/" target="_blank" rel="noopener noreferrer">
          <h2>
            <span className="navcard-icon" style={{ background: "#c2417f" }}>
              <Ic name="megaphone" size={17} />
            </span>
            Audiobooks
            <span className="navcard-arrow" aria-hidden>↗</span>
          </h2>
          <p>Stories read aloud — listen through OverDrive.</p>
        </a>
      </div>

      {Array.from({ length: extraRows }, (_, i) => (
        <BookRow key={`extra-${i}`} title="Keep exploring" emoji="🧭" kind="random" onPoints={onPoints} />
      ))}
      <div ref={sentinel} style={{ height: 1 }} />
    </div>
  );
}
