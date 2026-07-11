"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";

export type Shelf = {
  id: string;
  label: string;
  category: CategoryId;
  letter_range: string | null;
  shelf_number: string | null;
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

type View = { cx: number; cy: number; z: number };
type Mode = "view" | "build" | "edit";
const GRID = 25;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export default function LibraryMap({ editable }: { editable: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<Settings>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapUpdatedAt, setMapUpdatedAt] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; shelf: Shelf } | null>(null);

  // Floorplan dimensions drive the coordinate space (fallback: blank canvas)
  const W = settings?.floorplan_width ?? 4000;
  const H = settings?.floorplan_height ?? 3000;
  const hasPlan = Boolean(settings?.floorplan_path);

  const [view, setView] = useState<View>({ cx: 2000, cy: 1500, z: 1 });
  const viewRef = useRef(view);
  useEffect(() => {
    const v = { cx: W / 2, cy: H / 2, z: 1 };
    viewRef.current = v;
    setView(v);
  }, [W, H]);

  const vb = useMemo(() => {
    const w = W / view.z;
    const h = H / view.z;
    return `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`;
  }, [view, W, H]);

  // ── rAF-coalesced updates: at most one re-render per frame while dragging ──
  const raf = useRef<number | null>(null);
  const pending = useRef<{ view?: View; shelf?: { id: string; patch: Partial<Shelf> } }>({});
  const flush = useCallback(() => {
    raf.current = null;
    const p = pending.current;
    pending.current = {};
    if (p.view) setView(p.view);
    if (p.shelf) {
      const { id, patch } = p.shelf;
      setShelves((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }
  }, []);
  const schedule = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(flush);
  }, [flush]);
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  /** Set the view now (immediate) — for buttons. */
  function applyView(v: View) {
    viewRef.current = v;
    setView(v);
  }
  /** Queue a view change to the next frame — for gestures. */
  function queueView(v: View) {
    viewRef.current = v;
    pending.current.view = v;
    schedule();
  }

  async function load() {
    const res = await fetch("/api/map");
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      setShelves(data.shelves);
      setMapUpdatedAt(data.mapUpdatedAt ?? null);
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
    startView?: View;
    shelfStart?: { x: number; y: number; w: number; h: number };
    pointers: Map<number, { x: number; y: number }>;
    pinchStart?: { dist: number; z: number };
  }>({ kind: null, startPt: { x: 0, y: 0 }, pointers: new Map() });

  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  function zoomAt(pt: { x: number; y: number }, factor: number, immediate = false) {
    const v = viewRef.current;
    const z = Math.min(40, Math.max(0.8, v.z * factor));
    const k = v.z / z;
    const next = { z, cx: pt.x - (pt.x - v.cx) * k, cy: pt.y - (pt.y - v.cy) * k };
    if (immediate) applyView(next);
    else queueView(next);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setHover(null);
    zoomAt(svgPoint(e), e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  function onPointerDownBg(e: React.PointerEvent) {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured — fine */
    }
    setHover(null);
    const pt = svgPoint(e);
    gesture.current.pointers.set(e.pointerId, pt);
    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      gesture.current.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: viewRef.current.z };
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
      gesture.current.startView = viewRef.current;
      if (mode !== "edit") setSelected(null);
    }
  }

  function onPointerDownShelf(e: React.PointerEvent, s: Shelf) {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* fine */
    }
    setHover(null);
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
      gesture.current.startView = viewRef.current;
    }
  }

  function onPointerDownHandle(e: React.PointerEvent, s: Shelf) {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* fine */
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
        const v = viewRef.current;
        const z = Math.min(40, Math.max(0.8, g.pinchStart.z * (dist / g.pinchStart.dist)));
        const k = v.z / z;
        queueView({ z, cx: mid.x - (mid.x - v.cx) * k, cy: mid.y - (mid.y - v.cy) * k });
      }
      return;
    }

    if (g.kind === "pan" && g.startView) {
      queueView({
        z: g.startView.z,
        cx: g.startView.cx - (pt.x - g.startPt.x),
        cy: g.startView.cy - (pt.y - g.startPt.y),
      });
    } else if (g.kind === "draw" && draft) {
      const x = Math.min(g.startPt.x, snap(pt.x));
      const y = Math.min(g.startPt.y, snap(pt.y));
      setDraft({ x, y, w: Math.abs(snap(pt.x) - g.startPt.x), h: Math.abs(snap(pt.y) - g.startPt.y) });
    } else if (g.kind === "move" && selected && g.shelfStart) {
      const dx = snap(pt.x - g.startPt.x);
      const dy = snap(pt.y - g.startPt.y);
      pending.current.shelf = { id: selected, patch: { x: g.shelfStart.x + dx, y: g.shelfStart.y + dy } };
      schedule();
      markDirty();
    } else if (g.kind === "resize" && selected && g.shelfStart) {
      pending.current.shelf = {
        id: selected,
        patch: {
          w: Math.max(GRID, snap(g.shelfStart.w + (pt.x - g.startPt.x))),
          h: Math.max(GRID, snap(g.shelfStart.h + (pt.y - g.startPt.y))),
        },
      };
      schedule();
      markDirty();
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
          shelf_number: null,
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
        upserts: shelves.map((s) => ({
          ...s,
          shelf_number: s.shelf_number ?? null,
          notes_internal: s.notes_internal ?? null,
        })),
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
  const updatedLabel = mapUpdatedAt
    ? new Date(mapUpdatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
    : null;

  function shelfTip(e: React.MouseEvent, s: Shelf) {
    if (gesture.current.kind) return; // not while dragging
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, shelf: s });
  }

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
                  style={mode === m ? { background: "var(--brand-blue)", color: "#fff", borderColor: "var(--brand-blue)" } : undefined}
                  onClick={() => setMode(m)}
                >
                  {m === "view" ? "Navigate" : m === "build" ? "Build" : "Edit"}
                </button>
              ))}
            </span>
          )}
          <button className="btn" onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1.3, true)}>+</button>
          <button className="btn" onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1 / 1.3, true)}>−</button>
          <button className="btn" onClick={() => applyView({ cx: W / 2, cy: H / 2, z: 1 })}>Fit</button>
          {editable && dirty && (
            <button className="btn brand" onClick={save}>
              Save map
            </button>
          )}
          {notice && <span className="pill" style={{ background: "#e7f6f3" }}>{notice}</span>}
          {error && <span className="pill" style={{ background: "#fdecec" }}>{error}</span>}
          {updatedLabel && (
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
              Updated {updatedLabel}
            </span>
          )}
        </div>

        {editable && mode === "build" && (
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Drag anywhere on the map to draw a new shelf.
          </p>
        )}

        <div
          ref={containerRef}
          className="card"
          style={{ position: "relative", padding: 6, touchAction: "none", background: "#fbfbfd", overflow: "hidden" }}
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
                const numSize = Math.max(11, Math.min(s.w, s.h) * 0.16);
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
                      onMouseEnter={(e) => shelfTip(e, s)}
                      onMouseMove={(e) => shelfTip(e, s)}
                      onMouseLeave={() => setHover(null)}
                    />
                    {s.shelf_number && (
                      <text
                        x={s.x + numSize * 0.7}
                        y={s.y + numSize * 1.2}
                        textAnchor="start"
                        fill="#fff"
                        fontWeight={700}
                        fontSize={numSize}
                        opacity={0.92}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        #{s.shelf_number}
                      </text>
                    )}
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

          {hover && (
            <div
              style={{
                position: "absolute",
                left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 400) - 210),
                top: Math.max(hover.y - 10, 6),
                maxWidth: 220,
                background: "#1c2330",
                color: "#fff",
                borderRadius: 9,
                padding: "9px 12px",
                fontSize: 12.5,
                lineHeight: 1.4,
                pointerEvents: "none",
                boxShadow: "0 6px 18px rgba(16,24,40,.3)",
                zIndex: 5,
              }}
            >
              <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: CATEGORIES[hover.shelf.category].color }} />
                {hover.shelf.label}
                {hover.shelf.shelf_number ? ` · #${hover.shelf.shelf_number}` : ""}
              </div>
              <div style={{ opacity: 0.8, marginTop: 2 }}>
                {CATEGORIES[hover.shelf.category].label}
                {hover.shelf.letter_range ? ` · ${hover.shelf.letter_range}` : ""}
              </div>
              {hover.shelf.details_public && (
                <div style={{ marginTop: 4, opacity: 0.92 }}>
                  {hover.shelf.details_public.length > 120
                    ? hover.shelf.details_public.slice(0, 120) + "…"
                    : hover.shelf.details_public}
                </div>
              )}
            </div>
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
                <label className="lbl">Shelf number</label>
                <input className="input" value={sel.shelf_number ?? ""} maxLength={40} placeholder="e.g. 04 or R15" onChange={(e) => updateShelf(sel.id, { shelf_number: e.target.value || null })} />
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
                {sel.shelf_number ? ` · Shelf #${sel.shelf_number}` : ""}
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
