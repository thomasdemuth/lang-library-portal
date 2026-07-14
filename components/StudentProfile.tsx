"use client";

import { useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import { DEFAULT_AVATAR, type Avatar } from "@/lib/play";

type Fav = { book_key: string; title: string; isbn13: string | null };
type Data = { name: string; avatar: Avatar; booksRead: number; favorites: Fav[] };

/** Another student's public page: their avatar, reading count, and favorites wall. */
export default function StudentProfile({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

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
            📖 {data.booksRead} book{data.booksRead === 1 ? "" : "s"} read · ❤️ {data.favorites.length} favorite
            {data.favorites.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>❤️ {data.name.split(" ")[0]}'s favorite books</h2>
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
                  <span>❤️</span>
                  <b style={{ flex: 1 }}>{f.title}</b>
                </a>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="hint" style={{ textAlign: "center" }}>
        <a href="/">← Back to the library</a> · <a href="/me">My Page</a>
      </p>
    </div>
  );
}
