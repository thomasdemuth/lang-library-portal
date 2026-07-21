"use client";

import { useEffect, useState } from "react";
import { GAMES_COLOR } from "@/lib/categories";
import { GAME_SUBCATEGORIES, GAME_SUBCATEGORY_IDS, type Game, type GameSubcategory } from "@/lib/games";
import { Ic, Pin } from "@/components/icons";

/**
 * The games collection, laid out like the student home shelves: one
 * horizontally-scrolling row per sub-category (Card, Board, Word, Other),
 * reusing the same .newshelf / .bookcard visual language. Tapping a game
 * expands it into the same kind of detail panel books get. Empty
 * sub-categories are hidden. Shared by the student and staff portals.
 */
export default function GamesBrowser() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [migration, setMigration] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => {
        setGames(d.games ?? []);
        setMigration(Boolean(d.migrationPending));
      })
      .catch(() => setGames([]));
  }, []);

  function say(text: string) {
    setToast(text);
    setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 2600);
  }

  function toggle(g: Game, el: HTMLElement) {
    setExpandedId((cur) => {
      const next = cur === g.id ? null : g.id;
      if (next !== null) {
        // Fixed 156px cover + a detail panel — no per-cover aspect maths.
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }));
      }
      return next;
    });
  }

  async function where(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch("/api/games/where").then((r) => r.json()).catch(() => null);
    if (res?.found) window.location.href = `/map?shelf=${res.shelfId}`;
    else say("The games area isn't marked on the map yet.");
  }

  if (games === null) {
    return <p className="hint" style={{ padding: 20 }}>Loading games…</p>;
  }
  if (migration) {
    return <div className="notice">The games collection unlocks after the next library update — check back soon!</div>;
  }
  if (games.length === 0) {
    return <div className="card"><p className="hint" style={{ margin: 0 }}>No games in the collection yet — check back soon!</p></div>;
  }

  const bySub = (sub: GameSubcategory) => games.filter((g) => g.subcategory === sub);

  return (
    <>
      {GAME_SUBCATEGORY_IDS.map((sub) => {
        const list = bySub(sub);
        if (list.length === 0) return null; // hide empty sub-categories
        return (
          <div className="newshelf" key={sub}>
            <h2>
              <span className="newshelf-spark"><Ic name="dice" size={17} /></span> {GAME_SUBCATEGORIES[sub].label}
              {toast && <span className="row-toast">{toast}</span>}
            </h2>
            <div className="newshelf-row">
              {list.map((g) => {
                const open = expandedId === g.id;
                return (
                  <div
                    key={g.id}
                    className={`bookcard gamecard${open ? " expanded" : ""}`}
                    onClick={(e) => toggle(g, e.currentTarget)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(g, e.currentTarget)}
                  >
                    <div className="bc-cover">
                      {g.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.image_url} alt="" loading="lazy" />
                      ) : (
                        <span
                          className="game-cover-fallback"
                          style={{ background: `linear-gradient(150deg, ${GAMES_COLOR}, #2e7d32)` }}
                          aria-hidden
                        >
                          <Ic name="dice" size={38} />
                        </span>
                      )}
                      <span
                        className="bc-glow"
                        style={{ background: `radial-gradient(circle at top right, ${GAMES_COLOR} 0%, transparent 72%)` }}
                        aria-hidden
                      />
                      <span className="bc-titlebar"><span>{g.title}</span></span>
                    </div>

                    {open && (
                      <div className="bc-body">
                        <span className="bc-tag">
                          <span className="tagpill" style={{ background: GAMES_COLOR, fontSize: 10.5, padding: "2px 8px" }}>
                            {GAME_SUBCATEGORIES[g.subcategory].label}
                          </span>
                        </span>
                        <span className="bc-title">{g.title}</span>
                        <span className="bc-author">
                          {g.copies} {g.copies === 1 ? "copy" : "copies"}
                          {g.available ? "" : " · checked out"}
                          {g.condition ? ` · ${g.condition}` : ""}
                        </span>
                        {g.description ? (
                          <p className="bc-desc">{g.description}</p>
                        ) : (
                          <p className="hint" style={{ margin: 0 }}>No description on file yet.</p>
                        )}
                        <div className="bookact">
                          <button type="button" className="b-btn b-where" onClick={where}>
                            <Pin /> Where is it?
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
