"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
// The map uses the full set of area types — the book categories plus the
// map-only grass-green "games" area. (Book tag pickers keep the 6-category
// CATEGORIES; only the map shows games.)
import {
  MAP_CATEGORIES as CATEGORIES,
  MAP_CATEGORY_IDS as CATEGORY_IDS,
  type MapCategoryId as CategoryId,
} from "@/lib/categories";

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
  const [legendHidden, setLegendHidden] = useState(false);
  useEffect(() => {
    try {
      setLegendHidden(localStorage.getItem("ll-maplegend") === "hidden");
    } catch {}
  }, []);
  function toggleLegend() {
    setLegendHidden((cur) => {
      try {
        localStorage.setItem("ll-maplegend", cur ? "shown" : "hidden");
      } catch {}
      return !cur;
    });
  }

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

  // ── rAF-coalesced updates while dragging ──────────────────────────────
  // View changes during a gesture bypass React entirely. Pan/pinch don't
  // even touch the viewBox per frame: they set a CSS transform on the
  // <svg>, which the compositor applies on the GPU — the floorplan raster
  // is reused for the whole gesture instead of being redrawn every frame
  // (redrawing it is what made mobile panning lag). The final view is
  // baked into the viewBox once, when the gesture ends. Shelf move/resize
  // still needs React (the shelf's own nodes must re-render), but at most
  // once per frame.
  const raf = useRef<number | null>(null);
  const pending = useRef<{ view?: View; shelf?: { id: string; patch: Partial<Shelf> } }>({});
  const dims = useRef({ W, H });
  dims.current = { W, H };
  // Screen geometry frozen at gesture start: content px-per-unit and the
  // letterbox offset inside the <svg> element (its aspect never changes).
  const renderBase = useRef<{ v0: View; scale0: number; offX: number; offY: number } | null>(null);

  const writeViewBox = useCallback((v: View) => {
    const { W: w0, H: h0 } = dims.current;
    svgRef.current?.setAttribute(
      "viewBox",
      `${v.cx - w0 / v.z / 2} ${v.cy - h0 / v.z / 2} ${w0 / v.z} ${h0 / v.z}`
    );
  }, []);

  const flush = useCallback((): void => {
    raf.current = null;
    const p = pending.current;
    pending.current = {};
    if (p.view) {
      const svg = svgRef.current;
      const base = renderBase.current;
      if (svg && base) {
        // Similarity transform mapping the gesture-start rendering to the
        // current view: scale k about the element origin plus a translate
        // that accounts for the (constant) letterbox offset.
        const { W: w0, H: h0 } = dims.current;
        const { v0, scale0, offX, offY } = base;
        const v = p.view;
        const k = v.z / v0.z;
        const tx = offX * (1 - k) + k * scale0 * (v0.cx - w0 / (2 * v0.z) - (v.cx - w0 / (2 * v.z)));
        const ty = offY * (1 - k) + k * scale0 * (v0.cy - h0 / (2 * v0.z) - (v.cy - h0 / (2 * v.z)));
        svg.style.transformOrigin = "0 0";
        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      } else if (svg) {
        writeViewBox(p.view); // wheel zoom outside a pointer gesture
      }
    }
    if (p.shelf) {
      const { id, patch } = p.shelf;
      setShelves((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }
  }, [writeViewBox]);
  const schedule = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(flush);
  }, [flush]);
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  /** Set the view now, through React — for buttons and gesture-end commits. */
  function applyView(v: View) {
    viewRef.current = v;
    setView(v);
  }
  /** Queue a direct-to-DOM view write on the next frame — for gestures. */
  function queueView(v: View) {
    viewRef.current = v;
    pending.current.view = v;
    schedule();
  }
  /** Make the DOM viewBox current before reading the CTM at gesture start. */
  function flushPendingView() {
    if (raf.current != null && pending.current.view) {
      cancelAnimationFrame(raf.current);
      flush();
    }
  }

  /** Freeze the screen geometry a pan/pinch renders against (see flush). */
  function captureRenderBase() {
    const svg = svgRef.current;
    if (!svg) return;
    // Bake any leftover gesture transform first so the rect is untransformed
    if (svg.style.transform) {
      svg.style.transform = "";
      writeViewBox(viewRef.current);
    }
    const rect = svg.getBoundingClientRect();
    const { W: w0, H: h0 } = dims.current;
    const v0 = viewRef.current;
    const scale0 = Math.min(rect.width / (w0 / v0.z), rect.height / (h0 / v0.z));
    renderBase.current = {
      v0,
      scale0,
      offX: (rect.width - (w0 / v0.z) * scale0) / 2,
      offY: (rect.height - (h0 / v0.z) * scale0) / 2,
    };
  }

  /** Bake the gesture's CSS transform into the viewBox and sync React. */
  function endViewGesture() {
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    pending.current.view = undefined;
    renderBase.current = null;
    const svg = svgRef.current;
    if (svg) {
      writeViewBox(viewRef.current);
      svg.style.transform = "";
    }
    setView(viewRef.current);
  }

  // Wheel zooming has no "end" event: commit to React shortly after the
  // last tick so the committed tree matches what's on screen.
  const wheelIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (wheelIdle.current) clearTimeout(wheelIdle.current); }, []);
  function commitWheelSoon() {
    if (wheelIdle.current) clearTimeout(wheelIdle.current);
    wheelIdle.current = setTimeout(() => {
      // If a pointer gesture is mid-flight, its pointerup commit wins
      if (!renderBase.current) setView(viewRef.current);
    }, 200);
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

  // "Where is this book?" landing: /map?shelf=<id> selects that shelf and
  // flies the view to it (the selection pulse in CSS does the pointing).
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!loaded || focusedOnce.current) return;
    focusedOnce.current = true;
    const id = new URLSearchParams(window.location.search).get("shelf");
    if (!id) return;
    const s = shelves.find((x) => x.id === id);
    if (!s) return;
    setSelected(s.id);
    const z = Math.min(8, Math.max(2.2, Math.min(W / (s.w * 6), H / (s.h * 6))));
    applyView({ cx: s.x + s.w / 2, cy: s.y + s.h / 2, z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
  // Pan and pinch measure in CLIENT pixels, converted to map units through
  // a matrix captured once at gesture start. Measuring through the live CTM
  // (as before) created a feedback loop — the pan mutates the viewBox the
  // measurements depend on, one frame behind the pointer — which is what
  // made panning stutter and rubber-band.
  // Selection is applied on pointerUP, never on pointerdown: selecting opens
  // or closes the 300px side panel, which resizes the SVG and shifts its
  // screen-to-map scale — doing that mid-gesture corrupted every coordinate
  // captured at gesture start (shelves jumped, pans lurched).
  const gesture = useRef<{
    kind: "pan" | "move" | "resize" | "draw" | null;
    startPt: { x: number; y: number };
    startClient: { x: number; y: number };
    startInv?: DOMMatrix;
    startView?: View;
    shelfStart?: { x: number; y: number; w: number; h: number };
    pointers: Map<number, { x: number; y: number }>; // client px
    pinchStart?: { dist: number; z: number };
    moveId?: string; // shelf being moved/resized
    tapSelect?: string | null; // selection to apply on pointerup if it was a tap
    moved: boolean;
  }>({ kind: null, startPt: { x: 0, y: 0 }, startClient: { x: 0, y: 0 }, pointers: new Map(), moved: false });

  /** Begin panning from the current pointer, whatever it went down on. */
  function startPan(e: React.PointerEvent) {
    flushPendingView();
    captureRenderBase();
    const g = gesture.current;
    g.kind = "pan";
    g.startClient = { x: e.clientX, y: e.clientY };
    g.startInv = svgRef.current?.getScreenCTM()?.inverse() ?? undefined;
    g.startView = viewRef.current;
  }

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
    flushPendingView();
    zoomAt(svgPoint(e), e.deltaY < 0 ? 1.15 : 1 / 1.15);
    commitWheelSoon();
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
    gesture.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current.pointers.size === 2) {
      if (!renderBase.current) captureRenderBase();
      const [a, b] = [...gesture.current.pointers.values()];
      gesture.current.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: viewRef.current.z };
      gesture.current.kind = null;
      return;
    }
    gesture.current.moved = false;
    if (editable && mode === "build") {
      const pt = svgPoint(e);
      gesture.current.kind = "draw";
      gesture.current.startPt = { x: snap(pt.x), y: snap(pt.y) };
      setDraft({ x: snap(pt.x), y: snap(pt.y), w: 0, h: 0 });
    } else {
      startPan(e);
      if (mode !== "edit") gesture.current.tapSelect = null; // tap on background deselects
    }
  }

  const onPointerDownShelf = useCallback(
    (e: React.PointerEvent, s: Shelf) => {
      e.stopPropagation();
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* fine */
      }
      setHover(null);
      gesture.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture.current.moved = false;
      gesture.current.tapSelect = s.id;
      if (editable && mode === "edit") {
        gesture.current.kind = "move";
        gesture.current.moveId = s.id;
        gesture.current.startPt = svgPoint(e);
        gesture.current.startClient = { x: e.clientX, y: e.clientY };
        gesture.current.shelfStart = { x: s.x, y: s.y, w: s.w, h: s.h };
      } else {
        startPan(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, mode, svgPoint]
  );

  const onPointerDownHandle = useCallback(
    (e: React.PointerEvent, s: Shelf) => {
      e.stopPropagation();
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* fine */
      }
      gesture.current.kind = "resize";
      gesture.current.moveId = s.id;
      gesture.current.startPt = svgPoint(e);
      gesture.current.startClient = { x: e.clientX, y: e.clientY };
      gesture.current.shelfStart = { x: s.x, y: s.y, w: s.w, h: s.h };
      gesture.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture.current.moved = false;
      gesture.current.tapSelect = undefined;
    },
    [svgPoint]
  );

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) && g.kind === null) return;
    if (g.pointers.has(e.pointerId)) g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) > 5) {
      g.moved = true;
    }

    if (g.pointers.size === 2 && g.pinchStart) {
      g.moved = true;
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y); // client px — stable under view changes
      if (g.pinchStart.dist > 0) {
        const mid = svgPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        const v = viewRef.current;
        const z = Math.min(40, Math.max(0.8, g.pinchStart.z * (dist / g.pinchStart.dist)));
        const k = v.z / z;
        queueView({ z, cx: mid.x - (mid.x - v.cx) * k, cy: mid.y - (mid.y - v.cy) * k });
      }
      return;
    }

    if (g.kind === "pan" && g.startView && g.startInv) {
      // Client-pixel delta mapped to map units through the gesture-start
      // matrix (vector transform: scale/rotation terms only, no translation).
      const dxPx = e.clientX - g.startClient.x;
      const dyPx = e.clientY - g.startClient.y;
      const m = g.startInv;
      queueView({
        z: g.startView.z,
        cx: g.startView.cx - (m.a * dxPx + m.c * dyPx),
        cy: g.startView.cy - (m.b * dxPx + m.d * dyPx),
      });
      return;
    }

    const pt = svgPoint(e); // draw/move/resize don't change the view mid-gesture
    if (g.kind === "draw" && draft) {
      const x = Math.min(g.startPt.x, snap(pt.x));
      const y = Math.min(g.startPt.y, snap(pt.y));
      setDraft({ x, y, w: Math.abs(snap(pt.x) - g.startPt.x), h: Math.abs(snap(pt.y) - g.startPt.y) });
    } else if (g.kind === "move" && g.moveId && g.shelfStart) {
      const dx = snap(pt.x - g.startPt.x);
      const dy = snap(pt.y - g.startPt.y);
      pending.current.shelf = { id: g.moveId, patch: { x: g.shelfStart.x + dx, y: g.shelfStart.y + dy } };
      schedule();
      markDirty();
    } else if (g.kind === "resize" && g.moveId && g.shelfStart) {
      pending.current.shelf = {
        id: g.moveId,
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
    const wasViewGesture = g.kind === "pan" || g.pinchStart != null;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size < 2) g.pinchStart = undefined;
    // Bake the gesture's transform into the viewBox and sync React.
    if (wasViewGesture) endViewGesture();
    // Selection waits until here (see gesture comment): dragging a shelf
    // selects it on release; a tap selects/deselects; a pan changes nothing.
    if (g.kind === "move" && g.moveId) setSelected(g.moveId);
    else if (!g.moved && g.tapSelect !== undefined) setSelected(g.tapSelect);
    g.tapSelect = undefined;
    g.moveId = undefined;
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

  const shelfTip = useCallback((e: React.MouseEvent, s: Shelf) => {
    if (gesture.current.kind) return; // not while dragging
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, shelf: s });
  }, []);
  const clearTip = useCallback(() => setHover(null), []);

  return (
    <div className="maplayout" style={{ "--map-cols": sel ? "1fr 300px" : "1fr" } as React.CSSProperties}>
      <div>
        <div className="map-toolbar">
          {editable && (
            <span className="desk-only" style={{ display: "flex", gap: 4 }}>
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
          className="card mapcard"
          style={{ position: "relative", padding: 6, touchAction: "none", overflow: "hidden" }}
        >
          <div className="map-legend-overlay">
            {!legendHidden &&
              CATEGORY_IDS.map((id) => (
                <span key={id} aria-hidden>
                  <span className="dot" style={{ background: CATEGORIES[id].color, width: 9, height: 9 }} />
                  {CATEGORIES[id].label}
                </span>
              ))}
            <button type="button" className="legend-toggle" onClick={toggleLegend}>
              <span aria-hidden style={{ pointerEvents: "none" }}>
                {legendHidden ? "☰ Key" : "✕ Hide"}
              </span>
            </button>
          </div>
          {loaded && !hasPlan && !editable ? (
            <p className="hint" style={{ padding: 20 }}>
              The map is being set up — check back soon.
            </p>
          ) : (
            <svg
              ref={svgRef}
              viewBox={vb}
              className="mapsvg"
              style={{ cursor: mode === "build" ? "crosshair" : "grab" }}
              onWheel={onWheel}
              onPointerDown={onPointerDownBg}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {hasPlan && (
                <image
                  className="mapimg"
                  href={`/api/map/floorplan?v=${encodeURIComponent(settings?.updated_at ?? "")}`}
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  opacity={0.9}
                />
              )}
              {!hasPlan && <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#e2e6ee" />}

              {shelves.map((s) => (
                <ShelfNode
                  key={s.id}
                  s={s}
                  isSel={s.id === selected}
                  showHandle={editable && mode === "edit" && s.id === selected && s.rotation === 0}
                  onDown={onPointerDownShelf}
                  onDownHandle={onPointerDownHandle}
                  onTip={shelfTip}
                  onTipLeave={clearTip}
                />
              ))}

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

        <div className="desk-only" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
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

/**
 * One shelf's SVG nodes, memoized so panning commits and edit-mode drags
 * only re-render the shelves whose props actually changed.
 */
const ShelfNode = memo(function ShelfNode({
  s,
  isSel,
  showHandle,
  onDown,
  onDownHandle,
  onTip,
  onTipLeave,
}: {
  s: Shelf;
  isSel: boolean;
  showHandle: boolean;
  onDown: (e: React.PointerEvent, s: Shelf) => void;
  onDownHandle: (e: React.PointerEvent, s: Shelf) => void;
  onTip: (e: React.MouseEvent, s: Shelf) => void;
  onTipLeave: () => void;
}) {
  const c = CATEGORIES[s.category]?.color ?? "#000";
  const fontSize = Math.max(14, Math.min(s.w, s.h) * 0.3);
  const numSize = Math.max(11, Math.min(s.w, s.h) * 0.16);
  return (
    <g className={isSel ? "shelf-sel" : undefined} transform={`rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})`}>
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
        onPointerDown={(e) => onDown(e, s)}
        onMouseEnter={(e) => onTip(e, s)}
        onMouseMove={(e) => onTip(e, s)}
        onMouseLeave={onTipLeave}
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
      {showHandle && (
        <rect
          x={s.x + s.w - GRID}
          y={s.y + s.h - GRID}
          width={GRID}
          height={GRID}
          fill="#1c2330"
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => onDownHandle(e, s)}
        />
      )}
    </g>
  );
});
