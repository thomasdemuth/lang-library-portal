"use client";

import { useCallback, useEffect, useState } from "react";
import Collections from "@/components/Collections";
import FriendsCard from "@/components/FriendsCard";
import LetterAvatar from "@/components/LetterAvatar";
import { Heart, Ic } from "@/components/icons";
import { announce } from "@/components/Announcer";
import { displayName } from "@/lib/play";
import { logRead, removeRead, type NoteKind } from "@/lib/book-actions-client";
import { toggleFavorite, type FavBook } from "@/lib/favorites-client";
import { withBase } from "@/lib/base";

type Profile = { public_id?: string; photo_url?: string | null };
type LogRow = { id: number; book_key: string; title: string; created_at: string };
type Fav = FavBook & { isbn13: string | null };

/**
 * My Page: the student's personal reading log (with one-tap remove + undo),
 * favorites, custom book lists, and friends. Private to the student and
 * the library team.
 */
export default function MyPage({ email }: { email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<{ year: number; month: number } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [hiddenCovers, setHiddenCovers] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: NoteKind; undo?: () => void } | null>(null);
  const [migration, setMigration] = useState(false);

  const loadLog = useCallback(() => {
    fetch(withBase("/api/play/read"))
      .then((r) => r.json())
      .then((d) => setLog(d.log ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(withBase("/api/play/profile"))
      .then((r) => r.json())
      .then((d) => {
        if (d.migrationPending) setMigration(true);
        if (d.profile) {
          setProfile(d.profile);
          setCounts({ year: d.booksThisYear ?? 0, month: d.booksThisMonth ?? 0 });
        }
      })
      .catch(() => {});
    loadLog();
    fetch(withBase("/api/play/favorites"))
      .then((r) => r.json())
      .then((d) => setFavs(d.favorites ?? []))
      .catch(() => {});
  }, [loadLog]);

  function say(text: string, kind: NoteKind = "ok", undo?: () => void) {
    const next = { text, kind, undo };
    setToast(next);
    announce(text, kind === "err"); // screen readers hear every toast; errors interrupt
    setTimeout(() => setToast((cur) => (cur === next ? null : cur)), undo ? 5000 : 2600);
  }

  /** Shift the year/month counts when a log row with this date comes or goes. */
  function bumpCounts(createdAt: string, delta: number) {
    const d = new Date(createdAt);
    const now = new Date();
    setCounts((cur) => {
      if (!cur) return cur;
      const inYear = d.getUTCFullYear() === now.getUTCFullYear();
      const inMonth = inYear && d.getUTCMonth() === now.getUTCMonth();
      return {
        year: Math.max(0, cur.year + (inYear ? delta : 0)),
        month: Math.max(0, cur.month + (inMonth ? delta : 0)),
      };
    });
  }

  async function removeRow(row: LogRow) {
    const result = await removeRead(row.id);
    if ("error" in result) return say(result.error, result.kind);
    setLog((cur) => cur.filter((r) => r.id !== row.id));
    bumpCounts(row.created_at, -1);
    say("Removed from your log", "info", () => undoRemove(row));
  }

  async function undoRemove(row: LogRow) {
    const result = await logRead({ title: row.title, dedupe_key: row.book_key, isbn13: null });
    if ("error" in result) return say(result.error, result.kind);
    loadLog(); // the re-logged row gets a fresh id + date — reload the list
    bumpCounts(new Date().toISOString(), 1);
    say("Added back to your reading log");
  }

  async function unheart(f: Fav) {
    const result = await toggleFavorite(f);
    if ("error" in result) {
      setMsg(result.error);
      announce(result.error, true);
      setTimeout(() => setMsg(null), 2600);
    } else {
      setFavs((cur) => cur.filter((x) => x.book_key !== f.book_key));
    }
  }

  if (migration)
    return (
      <div className="wrap student-theme">
        <h1>My Page</h1>
        <div className="notice">My Page opens after the next library update — check back soon!</div>
      </div>
    );

  if (!profile)
    return (
      <div className="wrap student-theme">
        <p className="hint" style={{ padding: 30 }}>Loading your page…</p>
      </div>
    );

  const name = displayName(email);

  return (
    <div className="wrap student-theme">
      <div className="play-hero me-hero">
        <LetterAvatar name={name} size={104} src={profile.photo_url ?? undefined} />
        <div>
          <h1 style={{ margin: 0 }}>{name}</h1>
          <p className="play-stats" style={{ marginTop: 6 }}>
            Only you and the library team can see this page.
          </p>
          {profile.public_id && (
            <a className="play-cta" href={withBase(`/students/${profile.public_id}`)}>
              See my page like friends see it →
            </a>
          )}
        </div>
      </div>

      {msg && <div className="error">{msg}</div>}

      {/* v8 order on wide screens: reading (then friends) on the left,
          favorites + lists on the right; one column below 900px. */}
      <div className="me-grid">
        <div className="me-col">
          <div className="card" style={{ marginBottom: 14 }}>
            <h2>
              <Ic name="book" size={16} /> My reading{counts ? ` · ${counts.year} this year` : ""}
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
            {counts && (
              <p className="hint" style={{ marginTop: 0 }}>
                {counts.month} this month
              </p>
            )}
            {log.length === 0 ? (
              <p className="hint" style={{ marginBottom: 0 }}>Tap “I read this” on any book to start your log.</p>
            ) : (
              <div className="leader-rows">
                {log.map((row) => (
                  <div key={row.id} className="leader-row">
                    <Ic name="book" size={14} />
                    <b style={{ flex: 1 }}>{row.title}</b>
                    <span className="hint" style={{ margin: 0 }}>
                      {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <button type="button" className="linklike" onClick={() => removeRow(row)}>
                      remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FriendsCard />
        </div>

        <div className="me-col">
          <div className="card" style={{ marginBottom: 14 }}>
            <h2>
              <Heart filled size={16} /> Favorites · {favs.length}
            </h2>
            {favs.length === 0 ? (
              <p className="hint">Tap the heart on any book cover to collect favorites — friends can see them on your page.</p>
            ) : (
              <>
                <div className="fav-wall">
                  {favs
                    .filter((f) => f.isbn13 && !hiddenCovers.has(f.book_key))
                    .map((f) => (
                      <a key={f.book_key} className="fav-cover" href={withBase(`/search?q=${encodeURIComponent(f.title)}`)} title={f.title}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={withBase(`/api/catalog/cover?isbn=${f.isbn13}`)}
                          alt={f.title}
                          loading="lazy"
                          onError={() => setHiddenCovers((cur) => new Set(cur).add(f.book_key))}
                        />
                      </a>
                    ))}
                </div>
                <div className="leader-rows" style={{ marginTop: 12 }}>
                  {favs.map((f) => (
                    <div key={f.book_key} className="leader-row">
                      <Heart filled size={14} />
                      <b style={{ flex: 1 }}>{f.title}</b>
                      <button type="button" className="linklike" onClick={() => unheart(f)}>
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <Collections />
        </div>
      </div>
    </div>
  );
}
