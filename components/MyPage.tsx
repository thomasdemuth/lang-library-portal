"use client";

import { useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import { DEFAULT_AVATAR, displayName, ownsItem, type Avatar, type AvatarItem, type Slot } from "@/lib/play";
import { toggleFavorite, type FavBook } from "@/lib/favorites-client";

type Profile = { avatar: Avatar; owned: string[]; points: number; public_id?: string };
type LogRow = { id: number; title: string; created_at: string };
type Fav = FavBook & { isbn13: string | null };

const SLOT_LABELS: Record<Slot, string> = {
  base: "Your animal",
  hat: "Hats",
  accessory: "Buddies & gear",
  bg: "Backgrounds",
};

/** My Page: avatar workshop + star balance + reading log. */
export default function MyPage({ email }: { email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<AvatarItem[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [hiddenCovers, setHiddenCovers] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [migration, setMigration] = useState(false);

  useEffect(() => {
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.migrationPending) setMigration(true);
        if (d.profile) {
          setProfile({ ...d.profile, avatar: { ...DEFAULT_AVATAR, ...d.profile.avatar } });
          setCatalog(d.catalog ?? []);
        }
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
    if ("error" in result) say(false, result.error);
    else setFavs((cur) => cur.filter((x) => x.book_key !== f.book_key));
  }

  function say(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2600);
  }

  async function tapItem(item: AvatarItem) {
    if (!profile) return;
    const owned = ownsItem(profile.owned, item);
    if (!owned) {
      const res = await fetch("/api/play/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", id: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(false, data.error ?? "Couldn't buy that.");
        return;
      }
      setProfile((cur) => (cur ? { ...cur, owned: data.owned, points: data.points } : cur));
      say(true, `${item.label} is yours! 🎉`);
      // fall through to equip it right away
    }
    const equipped = profile.avatar[item.slot] === item.id;
    const res = await fetch("/api/play/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "equip", slot: item.slot, id: equipped ? null : item.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setProfile((cur) => (cur ? { ...cur, avatar: { ...DEFAULT_AVATAR, ...data.avatar } } : cur));
    else if (!equipped) say(false, data.error ?? "Couldn't equip that.");
  }

  if (migration)
    return (
      <div className="wrap student-theme">
        <h1>My Page</h1>
        <div className="notice">The avatar workshop opens after the next library update — check back soon!</div>
      </div>
    );

  if (!profile) return <div className="wrap student-theme"><p className="hint" style={{ padding: 30 }}>Loading your page…</p></div>;

  return (
    <div className="wrap student-theme">
      <div className="play-hero me-hero">
        <AvatarView avatar={profile.avatar} size={104} />
        <div>
          <h1 style={{ margin: 0 }}>{displayName(email)}</h1>
          <p className="play-stats" style={{ marginTop: 6 }}>
            ⭐ {profile.points} stars to spend · 📖 {log.length} book{log.length === 1 ? "" : "s"} logged · ❤️ {favs.length}{" "}
            favorite{favs.length === 1 ? "" : "s"}
          </p>
          {profile.public_id && (
            <a className="play-cta" href={`/students/${profile.public_id}`}>
              See my page like friends see it →
            </a>
          )}
        </div>
      </div>

      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}

      {(Object.keys(SLOT_LABELS) as Slot[]).map((slot) => (
        <div key={slot} className="card" style={{ marginBottom: 14 }}>
          <h2>{SLOT_LABELS[slot]}</h2>
          <div className="shop-grid">
            {catalog
              .filter((i) => i.slot === slot)
              .map((item) => {
                const owned = ownsItem(profile.owned, item);
                const equipped = profile.avatar[slot] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`shop-item${equipped ? " equipped" : ""}${owned ? "" : " locked"}`}
                    onClick={() => tapItem(item)}
                    title={owned ? (equipped ? "Tap to take off" : "Tap to wear") : `Costs ${item.price} ⭐`}
                  >
                    {item.emoji ? (
                      <span className="shop-emoji">{item.emoji}</span>
                    ) : (
                      <span className="shop-swatch" style={{ background: item.color }} />
                    )}
                    <span className="shop-label">{item.label}</span>
                    <span className="shop-price">{owned ? (equipped ? "wearing" : "owned") : `${item.price} ⭐`}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>❤️ My favorite books</h2>
        {favs.length === 0 ? (
          <p className="hint">Tap the 🤍 on any book cover to collect favorites — friends can see them on your page.</p>
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
                  <span>❤️</span>
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

      <div className="card">
        <h2>📖 Books I've read</h2>
        {log.length === 0 ? (
          <p className="hint">Tap “⭐ I read this” on any book to start your log.</p>
        ) : (
          <div className="leader-rows">
            {log.map((row) => (
              <div key={row.id} className="leader-row">
                <span>📕</span>
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
