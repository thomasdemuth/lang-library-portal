"use client";

import { useEffect, useState } from "react";
import LetterAvatar from "@/components/LetterAvatar";
import { Ic } from "@/components/icons";
import { withBase } from "@/lib/base";

type Friend = { id: string; name: string; booksRead: number; photoUrl?: string | null };

/** My friends: readers I've added from their public pages. */
export default function FriendsCard() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [migration, setMigration] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(withBase("/api/play/friends"))
      .then((r) => r.json())
      .then((d) => {
        setFriends(d.friends ?? []);
        setMigration(Boolean(d.migrationPending));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function remove(f: Friend) {
    const res = await fetch(withBase("/api/play/friends"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, action: "remove" }),
    });
    if (res.ok) setFriends((cur) => cur.filter((x) => x.id !== f.id));
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>
        <Ic name="users" size={16} /> My friends
      </h2>
      {migration ? (
        <p className="hint">Friends unlock after the next library update — check back soon!</p>
      ) : !loaded ? (
        <p className="hint">Loading…</p>
      ) : friends.length === 0 ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          Hit “Add friend” on a classmate's page — they'll show up here.
        </p>
      ) : (
        <div className="friend-grid">
          {friends.map((f) => (
            <div key={f.id} className="friend-tile">
              <a href={withBase(`/students/${f.id}`)} title={`Visit ${f.name}'s page`}>
                <LetterAvatar name={f.name} size={56} src={f.photoUrl ?? undefined} />
                <b>{f.name}</b>
                <span className="hint" style={{ margin: 0 }}>
                  {f.booksRead} book{f.booksRead === 1 ? "" : "s"}
                </span>
              </a>
              <button type="button" className="linklike" onClick={() => remove(f)}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
