"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameFormModal from "@/components/GameFormModal";
import { GAMES_COLOR } from "@/lib/categories";
import { GAME_SUBCATEGORIES, GAME_SUBCATEGORY_IDS, type Game, type GameSubcategory } from "@/lib/games";
import { Ic } from "@/components/icons";

/**
 * Games management — mirrors the book Inventory patterns: search + a
 * sub-category filter, a results table, multi-select with a bulk
 * re-categorize bar, and add/edit/remove via a form modal.
 */
export default function GamesPanel() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [migration, setMigration] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<GameSubcategory | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Game | null | "new">(null);
  const [bulk, setBulk] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const lastIdx = useRef<number | null>(null);

  const load = useCallback((query: string, sub: GameSubcategory | null) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (sub) params.set("subcategory", sub);
    fetch(`/api/admin/games?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setGames(d.games ?? []);
        setMigration(Boolean(d.migrationPending));
        setSelected(new Set());
      })
      .catch(() => setGames([]));
  }, []);

  useEffect(() => {
    load("", null);
  }, [load]);

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    load(q, filter);
  }
  function setFilterAnd(sub: GameSubcategory | null) {
    setFilter(sub);
    load(q, sub);
  }

  function toggleSelect(id: number, index: number, shift: boolean) {
    const anchor = lastIdx.current;
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && anchor !== null && games) {
        const [lo, hi] = [anchor, index].sort((a, b) => a - b);
        for (let i = lo; i <= hi; i++) next.add(games[i].id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastIdx.current = index;
  }
  function toggleAll() {
    setSelected((cur) => (games && cur.size === games.length ? new Set() : new Set(games?.map((g) => g.id))));
  }

  async function bulkMove(sub: GameSubcategory) {
    if (selected.size === 0) return;
    const ids = [...selected];
    setBulk({ busy: true, msg: null });
    try {
      const res = await fetch("/api/admin/games/recategorize", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, subcategory: sub }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setBulk({ busy: false, msg: data.error ?? "Couldn't move those." });
      setGames((cur) => cur?.map((g) => (selected.has(g.id) ? { ...g, subcategory: sub } : g)) ?? cur);
      setBulk({ busy: false, msg: `Moved ${ids.length} to ${GAME_SUBCATEGORIES[sub].label}` });
      setTimeout(() => setBulk((b) => ({ ...b, msg: null })), 4000);
      setSelected(new Set());
    } catch {
      setBulk({ busy: false, msg: "Couldn't move those." });
    }
  }

  function onSaved(g: Game) {
    setGames((cur) => {
      const list = cur ?? [];
      const i = list.findIndex((x) => x.id === g.id);
      return i >= 0 ? list.map((x) => (x.id === g.id ? g : x)) : [g, ...list];
    });
    setEditing(null);
  }
  function onDeleted(id: number) {
    setGames((cur) => cur?.filter((g) => g.id !== id) ?? cur);
    setEditing(null);
  }

  return (
    <>
      {editing !== null && (
        <GameFormModal
          game={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
      {migration && (
        <div className="notice">Games need migration 0017 — run it in the Supabase SQL editor.</div>
      )}

      <div className="card">
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <form onSubmit={search} className="searchrow" style={{ flex: 1, minWidth: 220 }}>
            <input className="input" placeholder="Search games…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="searchbtn" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" />
              </svg>
            </button>
          </form>
          <button type="button" className="gearbtn addbtn" title="Add a game" aria-label="Add a game" onClick={() => setEditing("new")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div className="tagpicker" style={{ marginTop: 10 }}>
          <button type="button" className={`tagchip${filter === null ? " active" : ""}`}
            style={filter === null ? { background: "var(--brand-blue)", borderColor: "var(--brand-blue)", color: "#fff" } : undefined}
            onClick={() => setFilterAnd(null)}>All</button>
          {GAME_SUBCATEGORY_IDS.map((id) => {
            const active = filter === id;
            return (
              <button key={id} type="button" className={`tagchip${active ? " active" : ""}`}
                style={active ? { background: GAMES_COLOR, borderColor: GAMES_COLOR, color: "#fff" } : undefined}
                onClick={() => setFilterAnd(active ? null : id)}>
                {!active && <span className="dot" style={{ background: GAMES_COLOR }} />}
                {GAME_SUBCATEGORIES[id].label}
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <b>{selected.size} selected</b>
            <span className="hint" style={{ margin: 0 }}>Move to:</span>
            {GAME_SUBCATEGORY_IDS.map((id) => (
              <button key={id} type="button" className="btn" style={{ padding: "5px 10px", fontSize: 12 }} disabled={bulk.busy} onClick={() => bulkMove(id)}>
                {GAME_SUBCATEGORIES[id].label}
              </button>
            ))}
            <button type="button" className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setSelected(new Set())}>Clear</button>
            {bulk.msg && <span className="hint" style={{ margin: 0 }}>{bulk.msg}</span>}
          </div>
        )}
        {selected.size === 0 && bulk.msg && <p className="hint">{bulk.msg}</p>}

        {games === null ? (
          <p className="hint" style={{ marginTop: 10 }}>Loading games…</p>
        ) : games.length === 0 ? (
          <p className="hint" style={{ marginTop: 10 }}>{migration ? "" : "No games yet — add one with the + button."}</p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 10 }}>{games.length} game{games.length === 1 ? "" : "s"}</p>
            <div className="tablewrap">
              <table className="table books">
                <thead>
                  <tr>
                    <th className="selcol">
                      <input type="checkbox" aria-label="Select all" checked={games.length > 0 && selected.size === games.length} onChange={toggleAll} />
                    </th>
                    <th>Title</th>
                    <th>Sub-category</th>
                    <th>Copies</th>
                    <th>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g, i) => (
                    <tr key={g.id} className={`bookrow${selected.has(g.id) ? " selected" : ""}`}>
                      <td className="selcol">
                        <input type="checkbox" aria-label={`Select ${g.title}`} checked={selected.has(g.id)}
                          onClick={(e) => toggleSelect(g.id, i, (e as React.MouseEvent).shiftKey)} onChange={() => {}} />
                      </td>
                      <td data-th="Title">
                        <button type="button" className="linklike" style={{ fontWeight: 600 }} onClick={() => setEditing(g)}>{g.title}</button>
                      </td>
                      <td data-th="Sub-category">
                        <span className="tagpill" style={{ background: GAMES_COLOR, fontSize: 10.5, padding: "2px 8px" }}>
                          {GAME_SUBCATEGORIES[g.subcategory].label}
                        </span>
                      </td>
                      <td data-th="Copies">{g.copies}</td>
                      <td data-th="Available">{g.available ? <Ic name="smile" size={14} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
