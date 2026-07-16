"use client";

import { useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import Collections from "@/components/Collections";
import FriendsCard from "@/components/FriendsCard";
import { Heart, Ic, Star } from "@/components/icons";
import { displayName, type Avatar } from "@/lib/play";
import { toggleFavorite, type FavBook } from "@/lib/favorites-client";

type Profile = { avatar: Avatar; owned: string[]; points: number; public_id?: string };
type LogRow = { id: number; title: string; created_at: string };
type Fav = FavBook & { isbn13: string | null };

/**
 * My Page: the student's collections — favorites, custom book lists,
 * friends, and reading history — plus their stats. Avatar editing lives
 * in the Avatar Studio (/avatar).
 */
export default function MyPage({ email }: { email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [hiddenCovers, setHiddenCovers] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [migration, setMigration] = useState(false);

  useEffect(() => {
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.migrationPending) setMigration(true);
        if (d.profile) setProfile(d.profile);
      })
      .catch(() => {});
    fetch("/api/play/read")
      .then((r) => r.json())
      .then((d) => setLog(d.log ?? []))
      .catch(() => {});
    fetch("/api/play/favorites")
      .then((r) => r.json())
      .then((d) => setFavs(d.favorites ?? []))
      .catch(() => {});
  }, []);

  async function unheart(f: Fav) {
    const result = await toggleFavorite(f);
    if ("error" in result) {
      setMsg(result.error);
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

  return (
    <div className="wrap student-theme">
      <div className="play-hero me-hero">
        <a href="/avatar" title="Edit my avatar">
          <AvatarView avatar={profile.avatar} size={104} />
        </a>
        <div>
          <h1 style={{ margin: 0 }}>{displayName(email)}</h1>
          <p className="play-stats" style={{ marginTop: 6 }}>
            <Star size={13} /> {profile.points} stars · <Ic name="book" size={13} /> {log.length} book
            {log.length === 1 ? "" : "s"} logged · <Heart filled size={13} /> {favs.length} favorite
            {favs.length === 1 ? "" : "s"}
          </p>
          <a className="play-cta" href="/avatar">
            Edit my avatar in the studio →
          </a>
          {profile.public_id && (
            <a className="play-cta" href={`/students/${profile.public_id}`}>
              See my page like friends see it →
            </a>
          )}
        </div>
      </div>

      {msg && <div className="error">{msg}</div>}

      <FriendsCard />

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>
          <Heart filled size={16} /> My favorite books
        </h2>
        {favs.length === 0 ? (
          <p className="hint">Tap the heart on any book cover to collect favorites — friends can see them on your page.</p>
        ) : (
          <>
            <div className="fav-wall">
              {favs
                .filter((f) => f.isbn13 && !hiddenCovers.has(f.book_key))
                .map((f) => (
                  <a key={f.book_key} className="fav-cover" href={`/search?q=${encodeURIComponent(f.title)}`} title={f.title}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/catalog/cover?isbn=${f.isbn13}`}
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
            <p className="hint" style={{ marginBottom: 0 }}>
              Other students can see your favorites on your page.
            </p>
          </>
        )}
      </div>

      <Collections />

      <div className="card">
        <h2>
          <Ic name="book" size={16} /> Books I've read
        </h2>
        {log.length === 0 ? (
          <p className="hint">Tap “I read this” on any book to start your log.</p>
        ) : (
          <div className="leader-rows">
            {log.map((row) => (
              <div key={row.id} className="leader-row">
                <Ic name="book" size={14} />
                <b style={{ flex: 1 }}>{row.title}</b>
                <span className="hint" style={{ margin: 0 }}>
                  {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
