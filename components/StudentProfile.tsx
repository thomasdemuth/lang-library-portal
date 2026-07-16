"use client";

import { useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import { Heart, Ic } from "@/components/icons";
import { DEFAULT_AVATAR, type Avatar } from "@/lib/play";

type Fav = { book_key: string; title: string; isbn13: string | null };
type Collection = { id: number; name: string; books: Fav[] };
type Data = {
  name: string;
  avatar: Avatar;
  booksRead: number;
  favorites: Fav[];
  collections?: Collection[];
  isFriend?: boolean;
  isMe?: boolean;
};

/** Another student's public page: avatar, reading count, favorites, and collections. */
export default function StudentProfile({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [friendMsg, setFriendMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/play/student?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (d.name) {
          setData({ ...d, avatar: { ...DEFAULT_AVATAR, ...d.avatar } });
          setState("ok");
        } else setState("missing");
      })
      .catch(() => setState("missing"));
  }, [id]);

  async function toggleFriend() {
    if (!data) return;
    const action = data.isFriend ? "remove" : "add";
    const res = await fetch("/api/play/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFriendMsg(d.error ?? "Couldn't do that.");
      setTimeout(() => setFriendMsg(null), 3200);
      return;
    }
    setData({ ...data, isFriend: d.isFriend });
  }

  if (state === "loading")
    return <div className="wrap student-theme"><p className="hint" style={{ padding: 30 }}>Finding that reader…</p></div>;
  if (state === "missing" || !data)
    return (
      <div className="wrap student-theme">
        <h1>Hmm…</h1>
        <div className="notice">We couldn't find that reader's page. <a href="/">Back to the library →</a></div>
      </div>
    );

  const covers = data.favorites.filter((f) => f.isbn13 && !hidden.has(f.book_key));

  return (
    <div className="wrap student-theme">
      <div className="play-hero me-hero">
        <AvatarView avatar={data.avatar} size={104} />
        <div>
          <h1 style={{ margin: 0 }}>{data.name}</h1>
          <p className="play-stats" style={{ marginTop: 6 }}>
            <Ic name="book" size={13} /> {data.booksRead} book{data.booksRead === 1 ? "" : "s"} read ·{" "}
            <Heart filled size={13} /> {data.favorites.length} favorite
            {data.favorites.length === 1 ? "" : "s"}
          </p>
          {!data.isMe && (
            <button type="button" className={`btn friend-btn${data.isFriend ? " is-friend" : ""}`} onClick={toggleFriend}>
              <Ic name={data.isFriend ? "usercheck" : "userplus"} size={15} />{" "}
              {data.isFriend ? "Friends" : "Add friend"}
            </button>
          )}
          {friendMsg && <p className="hint" style={{ margin: "6px 0 0" }}>{friendMsg}</p>}
        </div>
      </div>

      <div className="card">
        <h2>
          <Heart filled size={16} /> {data.name.split(" ")[0]}'s favorite books
        </h2>
        {data.favorites.length === 0 ? (
          <p className="hint">No favorites yet — check back soon!</p>
        ) : (
          <>
            {covers.length > 0 && (
              <div className="fav-wall">
                {covers.map((f) => (
                  <a key={f.book_key} className="fav-cover" href={`/search?q=${encodeURIComponent(f.title)}`} title={f.title}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/catalog/cover?isbn=${f.isbn13}`}
                      alt={f.title}
                      loading="lazy"
                      onError={() => setHidden((cur) => new Set(cur).add(f.book_key))}
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="leader-rows" style={{ marginTop: covers.length > 0 ? 12 : 0 }}>
              {data.favorites.map((f) => (
                <a key={f.book_key} className="leader-row" href={`/search?q=${encodeURIComponent(f.title)}`}>
                  <Heart filled size={14} />
                  <b style={{ flex: 1 }}>{f.title}</b>
                </a>
              ))}
            </div>
          </>
        )}
      </div>

      {(data.collections ?? []).map((col) => {
        const colCovers = col.books.filter((b) => b.isbn13 && !hidden.has(b.book_key));
        return (
          <div key={col.id} className="card" style={{ marginTop: 14 }}>
            <h2>
              <Ic name="folder" size={16} /> {col.name}
              <span className="hint" style={{ margin: "0 0 0 8px", fontWeight: 400 }}>
                {col.books.length} book{col.books.length === 1 ? "" : "s"}
              </span>
            </h2>
            {colCovers.length > 0 && (
              <div className="fav-wall">
                {colCovers.map((b) => (
                  <a key={b.book_key} className="fav-cover" href={`/search?q=${encodeURIComponent(b.title)}`} title={b.title}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/catalog/cover?isbn=${b.isbn13}`}
                      alt={b.title}
                      loading="lazy"
                      onError={() => setHidden((cur) => new Set(cur).add(b.book_key))}
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="leader-rows" style={{ marginTop: colCovers.length > 0 ? 12 : 0 }}>
              {col.books.map((b) => (
                <a key={b.book_key} className="leader-row" href={`/search?q=${encodeURIComponent(b.title)}`}>
                  <Ic name="book" size={14} />
                  <b style={{ flex: 1 }}>{b.title}</b>
                </a>
              ))}
            </div>
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center" }}>
        <a href="/">← Back to the library</a> · <a href="/me">My Page</a>
      </p>
    </div>
  );
}
