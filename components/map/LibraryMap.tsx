"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";

export type Shelf = {
  id: string;
  label: string;
  category: CategoryId;
  letter_range: string | null;
  details_public: string | null;
  notes_internal?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  sort: number;
};

type Settings = {
  floorplan_path: string | null;
  floorplan_width: number | null;
  floorplan_height: number | null;
  updated_at: string;
} | null;

type Mode = "view" | "build" | "edit";
const GRID = 25;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export default function LibraryMap({ editable }: { editable: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [settings, setSettings] = useState<Settings>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Floorplan dimensions drive the coordinate space (fallback: blank canvas)
  const W = settings?.floorplan_width ?? 4000;
  const H = settings?.floorplan_height ?? 3000;
  const hasPlan = Boolean(settings?.floorplan_path);

  const [view, setView] = useState({ cx: 2000, cy: 1500, z: 1 });
  useEffect(() => {
    setView({ cx: W / 2, cy: H / 2, z: 1 });
  }, [W, H]);

  const vb = useMemo(() => {
    const w = W / view.z;
    const h = H / view.z;
    return `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`;
  }, [view, W, H]);

  async function load() {
    const res = await fetch("/api/map");
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      setShelves(data.shelves);
      setDeleted([]);
      setDirty(false);
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  /** Screen event → floorplan coordinates (exact, letterbox-safe). */
  const svgPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY);
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // ── Pan / zoom / pinch ─────────────────────────────────────────────────
  const gesture = useRef<{
    kind: "pan" | "move" | "resize" | "draw" | null;
    startPt: { x: number; y: number };
    startView?: typeof view;
    shelfStart?: { x: number; y: number; w: number; h: number };
    draft?: { x: number; y: number; w: number; h: number };
    pointers: Map<number, { x: number; y: number }>;
    pinchStart?: { dist: number; z: number };
  }>({ kind: null, startPt: { x: 0, y: 0 }, pointers: new Map() });

  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  function zoomAt(pt: { x: number; y: number }, factor: number) {
    setView((v) => {
      const z = Math.min(40, Math.max(0.8, v.z * factor));
      const k = v.z / z;
      return { z, cx: pt.x - (pt.x - v.cx) * k, cy: pt.y - (pt.y - v.cy) * k };
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomAt(svgPoint(e), e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function onPointerDownBg(e: React.PointerEvent) {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured — fine */
    }
    const pt = svgPoint(e);
    gesture.current.pointers.set(e.pointerId, pt);
    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      gesture.current.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: view.z };
      gesture.current.kind = null;
      return;
    }
    if (editable && mode === "build") {
      gesture.current.kind = "draw";
      gesture.current.startPt = { x: snap(pt.x), y: snap(pt.y) };
      setDraft({ x: snap(pt.x), y: snap(pt.y), w: 0, h: 0 });
    } else {
      gesture.current.kind = "pan";
      gesture.current.startPt = pt;
      gesture.current.startView = view;
      if (mode !== "edit") setSelected(null);
    }
  }

  function onPointerDownShelf(e: React.PointerEvent, s: Shelf) {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured — fine */
    }
    setSelected(s.id);
    const pt = svgPoint(e);
    gesture.current.pointers.set(e.pointerId, pt);
    if (editable && mode === "edit") {
      gesture.current.kind = "move";
      gesture.current.startPt = pt;
      gesture.current.shelfStart = { x: s.x, y: s.y, w: s.w, h: s.h };
    } else {
      gesture.current.kind = "pan";
      gesture.current.startPt = pt;
      gesture.current.startView = view;
    }
  }

  function onPointerDownHandle(e: React.PointerEvent, s: Shelf) {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured — fine */
    }
    const pt = svgPoint(e);
    gesture.current.kind = "resize";
    gesture.current.startPt = pt;
    gesture.current.shelfStart = { x: s.x, y: s.y, w: s.w, h: s.h };
    gesture.current.pointers.set(e.pointerId, pt);
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) && g.kind === null) return;
    const pt = svgPoint(e);
    if (g.pointers.has(e.pointerId)) g.pointers.set(e.pointerId, pt);

    if (g.pointers.size === 2 && g.pinchStart) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinchStart.dist > 0) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const target = g.pinchStart.z * (dist / g.pinchStart.dist);
        setView((v) => {
          const z = Math.min(40, Math.max(0.8, target));
          const k = v.z / z;
          return { z, cx: mid.x - (mid.x - v.cx) * k, cy: mid.y - (mid.y - v.cy) * k };
        });
      }
      return;
    }

    if (g.kind === "pan" && g.startView) {
      // Deltas measured in floorplan units at the gesture-start view
      setView({
        z: g.startView.z,
        cx: g.startView.cx - (pt.x - g.startPt.x),
        cy: g.startView.cy - (pt.y - g.startPt.y),
      });
    } else if (g.kind === "draw" && draft) {
      const x = Math.min(g.startPt.x, snap(pt.x));
      const y = Math.min(g.startPt.y, snap(pt.y));
      setDraft({
        x,
        y,
        w: Math.abs(snap(pt.x) - g.startPt.x),
        h: Math.abs(snap(pt.y) - g.startPt.y),
      });
    } else if (g.kind === "move" && selected && g.shelfStart) {
      const dx = snap(pt.x - g.startPt.x);
      const dy = snap(pt.y - g.startPt.y);
      updateShelf(selected, { x: g.shelfStart.x + dx, y: g.shelfStart.y + dy });
    } else if (g.kind === "resize" && selected && g.shelfStart) {
      updateShelf(selected, {
        w: Math.max(GRID, snap(g.shelfStart.w + (pt.x - g.startPt.x))),
        h: Math.max(GRID, snap(g.shelfStart.h + (pt.y - g.startPt.y))),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size < 2) g.pinchStart = undefined;
    if (g.kind === "draw" && draft) {
      if (draft.w >= GRID && draft.h >= GRID) {
        const id = crypto.randomUUID();
        const shelf: Shelf = {
          id,
          label: "New shelf",
          category: "fiction",
          letter_range: null,
          details_public: null,
          notes_internal: null,
          x: draft.x,
          y: draft.y,
          w: draft.w,
          h: draft.h,
          rotation: 0,
          sort: shelves.length,
        };
        setShelves((cur) => [...cur, shelf]);
        setSelected(id);
        setDirty(true);
        setMode("edit");
      }
      setDraft(null);
    }
    g.kind = null;
  }

  function updateShelf(id: string, patch: Partial<Shelf>) {
    setShelves((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function removeShelf(id: string) {
    setShelves((cur) => cur.filter((s) => s.id !== id));
    setDeleted((cur) => [...cur, id]);
    setSelected(null);
    setDirty(true);
  }

  async function save() {
    setError(null);
    const res = await fetch("/api/admin/shelves", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upserts: shelves.map((s) => ({ ...s, notes_internal: s.notes_internal ?? null })),
        deleteIds: deleted,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save the map.");
      return;
    }
    setNotice("Map saved.");
    setTimeout(() => setNotice(null), 2500);
    load();
  }

  const sel = shelves.find((s) => s.id === selected) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 300px" : "1fr", gap: 16 }}>
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          {editable && (
            <span style={{ display: "flex", gap: 4 }}>
              {(["view", "build", "edit"] as Mode[]).map((m) => (
                <button
                  key={m}
                  className="btn"
                  style={mode === m ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
                  onClick={() => setMode(m)}
                >
                  {m === "view" ? "Navigate" : m === "build" ? "Build" : "Edit"}
                </button>
              ))}
            </span>
          )}
          <button className="btn" onClick={() => zoomAt({ x: view.cx, y: view.cy }, 1.3)}>+</button>
          <button className="btn" onClick={() => zoomAt({ x: view.cx, y: view.cy }, 1 / 1.3)}>−</button>
          <button className="btn" onClick={() => setView({ cx: W / 2, cy: H / 2, z: 1 })}>Fit</button>
          {editable && dirty && (
            <button className="btn primary" onClick={save}>
              Save map
            </button>
          )}
          {notice && <span className="pill" style={{ background: "#e7f6f3" }}>{notice}</span>}
          {error && <span className="pill" style={{ background: "#fdecec" }}>{error}</span>}
        </div>

        {editable && mode === "build" && (
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Drag anywhere on the map to draw a new shelf.
          </p>
        )}

        <div
          className="card"
          style={{ padding: 6, touchAction: "none", background: "#fbfbfd", overflow: "hidden" }}
        >
          {loaded && !hasPlan && !editable ? (
            <p className="hint" style={{ padding: 20 }}>
              The map is being set up — check back soon.
            </p>
          ) : (
            <svg
              ref={svgRef}
              viewBox={vb}
              style={{ width: "100%", height: "70vh", display: "block", cursor: mode === "build" ? "crosshair" : "grab" }}
              onWheel={onWheel}
              onPointerDown={onPointerDownBg}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {hasPlan && (
                <image
                  href={`/api/map/floorplan?v=${encodeURIComponent(settings?.updated_at ?? "")}`}
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  opacity={0.9}
                />
              )}
              {!hasPlan && <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#e2e6ee" />}

              {shelves.map((s) => {
                const c = CATEGORIES[s.category]?.color ?? "#000";
                const isSel = s.id === selected;
                const fontSize = Math.max(14, Math.min(s.w, s.h) * 0.3);
                return (
                  <g key={s.id} transform={`rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})`}>
                    <rect
                      x={s.x}
                      y={s.y}
                      width={s.w}
                      height={s.h}
                      rx={6}
                      fill={c}
                      opacity={0.92}
                      stroke={isSel ? "#1c2330" : "#ffffff"}
                      strokeWidth={isSel ? 8 : 3}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => onPointerDownShelf(e, s)}
                    />
                    <text
                      x={s.x + s.w / 2}
                      y={s.y + s.h / 2 + (s.letter_range ? -fontSize * 0.25 : fontSize * 0.35)}
                      textAnchor="middle"
                      fill="#fff"
                      fontWeight={800}
                      fontSize={fontSize}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {s.label}
                    </text>
                    {s.letter_range && (
                      <text
                        x={s.x + s.w / 2}
                        y={s.y + s.h / 2 + fontSize * 0.85}
                        textAnchor="middle"
                        fill="#fff"
                        fontWeight={600}
                        fontSize={fontSize * 0.7}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {s.letter_range}
                      </text>
                    )}
                    {editable && mode === "edit" && isSel && s.rotation === 0 && (
                      <rect
                        x={s.x + s.w - GRID}
                        y={s.y + s.h - GRID}
                        width={GRID}
                        height={GRID}
                        fill="#1c2330"
                        style={{ cursor: "nwse-resize" }}
                        onPointerDown={(e) => onPointerDownHandle(e, s)}
                      />
                    )}
                  </g>
                );
              })}

              {draft && draft.w > 0 && (
                <rect
                  x={draft.x}
                  y={draft.y}
                  width={draft.w}
                  height={draft.h}
                  fill="#1c2330"
                  opacity={0.35}
                  stroke="#1c2330"
                  strokeDasharray="12 8"
                  strokeWidth={4}
                />
              )}
            </svg>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          {CATEGORY_IDS.map((id) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
              <span className="dot" style={{ background: CATEGORIES[id].color }} />
              {CATEGORIES[id].label}
            </span>
          ))}
        </div>
      </div>

      {sel && (
        <div className="card" style={{ alignSelf: "start", position: "sticky", top: 16 }}>
          {editable && mode !== "view" ? (
            <>
              <h2 style={{ marginTop: 0, fontSize: 15 }}>Edit shelf</h2>
              <div className="field">
                <label className="lbl">Label</label>
                <input className="input" value={sel.label} maxLength={80} onChange={(e) => updateShelf(sel.id, { label: e.target.value })} />
              </div>
              <div className="field">
                <label className="lbl">Category</label>
                <select className="input" value={sel.category} onChange={(e) => updateShelf(sel.id, { category: e.target.value as CategoryId })}>
                  {CATEGORY_IDS.map((id) => (
                    <option key={id} value={id}>
                      {CATEGORIES[id].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="lbl">Letter range</label>
                <input className="input" value={sel.letter_range ?? ""} maxLength={40} placeholder="AA–AZ" onChange={(e) => updateShelf(sel.id, { letter_range: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl">Public details</label>
                <textarea className="input" value={sel.details_public ?? ""} maxLength={1000} placeholder="What students see when they tap this shelf" onChange={(e) => updateShelf(sel.id, { details_public: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl">Internal notes (admins only)</label>
                <textarea className="input" value={sel.notes_internal ?? ""} maxLength={2000} placeholder="Weeding notes, condition, plans…" onChange={(e) => updateShelf(sel.id, { notes_internal: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl">Rotation (°)</label>
                <input
                  className="input"
                  type="number"
                  min={-360}
                  max={360}
                  step={15}
                  value={sel.rotation}
                  onChange={(e) => updateShelf(sel.id, { rotation: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn ghost" onClick={() => removeShelf(sel.id)}>
                  Delete shelf
                </button>
                <button className="btn" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ marginTop: 0, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="dot" style={{ background: CATEGORIES[sel.category].color }} />
                {sel.label}
              </h2>
              <p className="hint" style={{ marginTop: 0 }}>
                {CATEGORIES[sel.category].label}
                {sel.letter_range ? ` · ${sel.letter_range}` : ""}
              </p>
              {sel.details_public && <p style={{ fontSize: 14 }}>{sel.details_public}</p>}
              {editable && sel.notes_internal && (
                <p className="hint">
                  <b>Internal:</b> {sel.notes_internal}
                </p>
              )}
              <button className="btn" onClick={() => setSelected(null)}>
                Close
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
