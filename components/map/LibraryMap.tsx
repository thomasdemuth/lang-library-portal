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
import { announce } from "@/components/Announcer";
import { withBase } from "@/lib/base";

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

/** How far one arrow-key press pans, as a fraction of the visible extent. */
const PAN_STEP = 0.15;

/**
 * A shelf's spoken name: "Shelf 12 — Comics, A to Z". The category is left
 * out when it only repeats the shelf's own label ("Comics" / comics).
 */
function shelfName(s: Shelf): string {
  const cat = CATEGORIES[s.category]?.label ?? "";
  const parts: string[] = [s.label];
  if (cat && cat.toLowerCase() !== s.label.trim().toLowerCase()) parts.push(cat);
  if (s.letter_range) parts.push(s.letter_range);
  const body = parts.filter(Boolean).join(", ");
  return s.shelf_number ? `Shelf ${s.shelf_number} — ${body}` : body;
}

/** What a screen reader hears when a shelf is selected — name plus the
 *  public blurb admins write for exactly this moment. */
function shelfAnnouncement(s: Shelf): string {
  return s.details_public ? `${shelfName(s)}. ${s.details_public}` : shelfName(s);
}

/**
 * Keyboard/touch affordances the map needs but globals.css can't carry
 * (that file belongs to another workstream). Hoisted + de-duplicated by
 * React 19 via href/precedence, so the sheet exists once per page.
 *
 *  · a focus ring on the shelf rect that reads as *focus*, not selection —
 *    the selected shelf already wears a solid 8px #1c2330 stroke, so the
 *    focused one wears a dashed stroke of the brand blue over the top.
 *  · on-screen zoom buttons for phones, where .map-toolbar is display:none.
 */
const MAP_A11Y_CSS = `
.mapsvg g[role="button"]:focus { outline: none; }
.mapsvg g[role="button"]:focus-visible { outline: none; }
.mapsvg g[role="button"]:focus-visible > rect:first-child {
  stroke: #2e50c8; stroke-width: 10; stroke-dasharray: 16 10;
}
.mapcard:focus-visible { outline: 3px solid #2e50c8; outline-offset: -3px; }
.map-zoom-touch { display: none; }
@media (max-width: 640px) {
  .map-zoom-touch {
    position: absolute; right: 10px; bottom: 16px; z-index: 6;
    display: flex; flex-direction: column; gap: 8px;
  }
}
`;

/** 44×44 — the WCAG 2.5.5 target size, which the stock .btn doesn't reach. */
const ZOOM_TOUCH_BTN: React.CSSProperties = {
  width: 44,
  height: 44,
  minHeight: 44,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1,
  borderRadius: 12,
  boxShadow: "0 3px 12px rgba(16,24,40,.22)",
};

export default function LibraryMap({
  editable,
  highlightShelfId,
}: {
  editable: boolean;
  /** W4-C2 (Find-a-Book split view): optional externally-driven highlight.
   *  Setting it selects + zooms to that shelf — the exact behavior of the
   *  `?shelf=` URL param — so the mini-map can light up a search result's
   *  shelf without a navigation. */
  highlightShelfId?: string | null;
}) {
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
  const [saving, setSaving] = useState(false);
  // A ref as well as state: two clicks in the same frame both read the ref,
  // which is already true for the second one — state wouldn't be yet.
  const savingRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [undoDel, setUndoDel] = useState<{ shelf: Shelf; index: number } | null>(null);
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

  // One toast at a time, with its own timer — a delete toast carries an
  // Undo, so it stays up longer than "Map saved." and must not be cut
  // short (or left behind) by a toast that lands after it.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string, ms = 2500) => {
    setNotice(text);
    announce(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      setUndoDel(null);
    }, ms);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  async function load() {
    const res = await fetch(withBase("/api/map"));
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      setShelves(data.shelves);
      setMapUpdatedAt(data.mapUpdatedAt ?? null);
      setDeleted([]);
      setDirty(false);
      setLoaded(true);
      // Whatever was pending is now settled: nothing to undo, nothing to
      // reconcile — the server's version is on screen.
      setUndoDel(null);
      setConflict(false);
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

  // W4-C2: externally-driven highlight (the Find-a-Book split view's
  // mini-map). Exactly the ?shelf= landing path above — select + fly to —
  // but re-runnable, so each looked-up book lights its shelf in turn.
  useEffect(() => {
    if (!loaded || !highlightShelfId) return;
    const s = shelves.find((x) => x.id === highlightShelfId);
    if (!s) return;
    setSelected(s.id);
    const z = Math.min(8, Math.max(2.2, Math.min(W / (s.w * 6), H / (s.h * 6))));
    applyView({ cx: s.x + s.w / 2, cy: s.y + s.h / 2, z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, highlightShelfId]);

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

  // ── Unsaved-changes guard ──────────────────────────────────────────────
  // Map edits live only in this component until Save, so a navigation is a
  // silent data loss. Two nets, both armed only while dirty:
  //   1. beforeunload — tab close, reload, typed URL, and the Alt+1–9 jumps
  //      in components/Shortcuts.tsx (they assign window.location.href,
  //      which is an ordinary navigation and fires this).
  //   2. a capture-phase document click — the shell's nav is plain <a href>
  //      links, so this catches them before anything else and asks in words
  //      that name the map, which the browser's generic dialog can't.
  // When the click guard has already asked, `leaving` suppresses net 1 so
  // the admin isn't made to confirm the same departure twice.
  const leaving = useRef(false);
  useEffect(() => {
    if (!editable || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = ""; // the pattern browsers still key the prompt off
    };
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window: this page stays
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // beforeunload still covers it
      // Same page (a hash or the link to where we already are) isn't a loss.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (window.confirm("You have unsaved map changes — leave anyway?")) {
        leaving.current = true;
        // If the navigation doesn't actually happen, re-arm rather than
        // leave the guard permanently disabled.
        setTimeout(() => (leaving.current = false), 4000);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [editable, dirty]);

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

  // Deleting a shelf takes two clicks: the button arms for 3 seconds and
  // then asks to be clicked again (the same shape as BookEditModal's
  // inline confirm), so a mis-aimed click can't take a shelf out.
  const delArm = useRef<ReturnType<typeof setTimeout> | null>(null);
  function armDelete() {
    setConfirmDel(true);
    if (delArm.current) clearTimeout(delArm.current);
    delArm.current = setTimeout(() => setConfirmDel(false), 3000);
  }
  useEffect(() => () => { if (delArm.current) clearTimeout(delArm.current); }, []);
  // A different shelf's panel starts unarmed.
  useEffect(() => { setConfirmDel(false); }, [selected]);

  function removeShelf(id: string) {
    const index = shelves.findIndex((s) => s.id === id);
    const shelf = shelves[index];
    if (!shelf) return;
    setConfirmDel(false);
    setShelves((cur) => cur.filter((s) => s.id !== id));
    setDeleted((cur) => [...cur, id]);
    setSelected(null);
    setDirty(true);
    // Nothing has left the browser: the row is only deleted server-side by
    // save(), via deleteIds. So Undo is a pure local restore.
    setUndoDel({ shelf, index });
    say(`Deleted “${shelf.label}”.`, 8000);
  }

  /** Put the just-deleted shelf back where it was, and un-queue its delete. */
  function undoRemove() {
    const entry = undoDel;
    if (!entry) return;
    setShelves((cur) => {
      if (cur.some((s) => s.id === entry.shelf.id)) return cur;
      const next = [...cur];
      next.splice(Math.min(entry.index, next.length), 0, entry.shelf);
      return next;
    });
    setDeleted((cur) => cur.filter((x) => x !== entry.shelf.id));
    setSelected(entry.shelf.id);
    setUndoDel(null);
    say("Delete undone.");
  }

  /**
   * Bulk-save the map. `force` re-sends after a 409, overwriting whatever
   * the other editor saved — only ever from the admin choosing that.
   */
  async function save(force = false) {
    if (savingRef.current) return; // a save is already in flight
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      const res = await fetch(withBase("/api/admin/shelves"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upserts: shelves.map((s) => ({
            ...s,
            shelf_number: s.shelf_number ?? null,
            notes_internal: s.notes_internal ?? null,
          })),
          deleteIds: deleted,
          // The map state these edits are based on. The server refuses the
          // save if the live map has moved on since (409).
          ...(mapUpdatedAt ? { baseUpdatedAt: mapUpdatedAt } : {}),
          ...(force ? { force: true } : {}),
        }),
      });
      if (res.status === 409) {
        // Nothing is discarded: the edits stay in state and stay dirty, and
        // the banner below the toolbar asks which version should win.
        setConflict(true);
        return;
      }
      if (res.status === 401) {
        // Deliberately no redirect — leaving this page would destroy the
        // unsaved edits the admin is trying to rescue.
        setError("Session expired — sign in again in a new tab, then come back and Save.");
        return;
      }
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the map.");
        return;
      }
      say("Map saved.");
      load();
    } catch {
      setError("Couldn't reach the server — your changes are still here. Try Save again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const sel = shelves.find((s) => s.id === selected) ?? null;
  const updatedLabel = mapUpdatedAt
    ? new Date(mapUpdatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
    : null;

  // ── Keyboard operation ────────────────────────────────────────────────
  // Every shelf is a tab stop (role="button" on its <g>); the map frame is
  // one too, and owns the view: arrows pan, +/− zoom, 0 or F fits, Escape
  // closes the shelf panel. Arrow presses from a focused shelf bubble up to
  // here, so panning works wherever focus sits inside the map.
  const shelvesRef = useRef(shelves);
  shelvesRef.current = shelves;

  /** Speak the selected shelf — the same public detail the panel shows. */
  useEffect(() => {
    if (!selected) return;
    const s = shelvesRef.current.find((x) => x.id === selected);
    if (s) announce(shelfAnnouncement(s));
  }, [selected]);

  /** Pan (never zoom) so a shelf that took focus off-screen is on-screen. */
  const ensureVisible = useCallback(
    (s: Shelf) => {
      // Clicking a shelf also focuses it. Panning then would move the map
      // out from under the finger and corrupt the coordinates the gesture
      // captured at pointerdown — so this is keyboard-only, by construction.
      if (gesture.current.pointers.size > 0 || gesture.current.kind) return;
      const v = viewRef.current;
      const halfW = W / v.z / 2;
      const halfH = H / v.z / 2;
      const cx0 = s.x + s.w / 2;
      const cy0 = s.y + s.h / 2;
      if (Math.abs(cx0 - v.cx) <= halfW * 0.9 && Math.abs(cy0 - v.cy) <= halfH * 0.9) return;
      applyView({ cx: cx0, cy: cy0, z: v.z });
    },
    // applyView only touches refs/state setters — stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [W, H]
  );

  /** Enter/Space on a shelf = a tap on it. */
  const activateShelf = useCallback((s: Shelf) => {
    setSelected(s.id);
  }, []);

  function onMapKeyDown(e: React.KeyboardEvent) {
    // Never steal keys from the shelf editor's fields (they're outside this
    // container today; the guard keeps that from becoming a trap tomorrow).
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    flushPendingView();
    const v = viewRef.current;
    const stepX = (W / v.z) * PAN_STEP;
    const stepY = (H / v.z) * PAN_STEP;
    switch (e.key) {
      case "ArrowLeft":
        applyView({ ...v, cx: v.cx - stepX });
        break;
      case "ArrowRight":
        applyView({ ...v, cx: v.cx + stepX });
        break;
      case "ArrowUp":
        applyView({ ...v, cy: v.cy - stepY });
        break;
      case "ArrowDown":
        applyView({ ...v, cy: v.cy + stepY });
        break;
      case "+":
      case "=":
        zoomAt({ x: v.cx, y: v.cy }, 1.3, true);
        break;
      case "-":
      case "_":
        zoomAt({ x: v.cx, y: v.cy }, 1 / 1.3, true);
        break;
      case "0":
      case "f":
      case "F":
        applyView({ cx: W / 2, cy: H / 2, z: 1 });
        break;
      case "Escape":
        if (!selected) return;
        setSelected(null);
        break;
      default:
        return; // not ours — let the page have it
    }
    e.preventDefault();
  }

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
                  aria-pressed={mode === m}
                  style={mode === m ? { background: "var(--brand-blue)", color: "#fff", borderColor: "var(--brand-blue)" } : undefined}
                  onClick={() => setMode(m)}
                >
                  {m === "view" ? "Navigate" : m === "build" ? "Build" : "Edit"}
                </button>
              ))}
            </span>
          )}
          <button className="btn" aria-label="Zoom in" onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1.3, true)}>
            <span aria-hidden>+</span>
          </button>
          <button className="btn" aria-label="Zoom out" onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1 / 1.3, true)}>
            <span aria-hidden>−</span>
          </button>
          <button className="btn" onClick={() => applyView({ cx: W / 2, cy: H / 2, z: 1 })}>Fit</button>
          {editable && dirty && (
            <button className="btn brand" onClick={() => save()} disabled={saving}>
              {saving ? "Saving…" : "Save map"}
            </button>
          )}
          {notice && (
            <span
              className="pill"
              style={{ background: "var(--ok-bg)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {notice}
              {undoDel && (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "0 4px", minHeight: 0, height: "auto", fontSize: 11, fontWeight: 800 }}
                  onClick={undoRemove}
                >
                  Undo
                </button>
              )}
            </span>
          )}
          {updatedLabel && (
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
              Updated {updatedLabel}
            </span>
          )}
        </div>

        {conflict && (
          <div
            className="error"
            role="alert"
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <span>Someone else changed the map. Your edits are still here — choose one:</span>
            <button
              className="btn"
              disabled={saving}
              onClick={() => {
                if (!window.confirm("Discard your unsaved map changes and load their version?")) return;
                setConflict(false);
                load();
              }}
            >
              Reload their version
            </button>
            <button className="btn danger" disabled={saving} onClick={() => save(true)}>
              {saving ? "Saving…" : "Save mine anyway"}
            </button>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {editable && mode === "build" && (
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Drag anywhere on the map to draw a new shelf.
          </p>
        )}

        <div
          ref={containerRef}
          className="card mapcard"
          style={{ position: "relative", padding: 6, touchAction: "none", overflow: "hidden" }}
          // Deliberately NOT role="application": this stays a document, so
          // screen readers keep their own reading keys. It's a named group
          // that happens to be focusable and answers to the view keys.
          role="group"
          aria-label="Library map"
          aria-describedby="map-keys"
          tabIndex={0}
          onKeyDown={onMapKeyDown}
        >
          <style href="library-map-a11y" precedence="default">{MAP_A11Y_CSS}</style>
          <p className="sr-only" id="map-keys">
            Arrow keys pan the map. Plus and minus zoom. Press 0 or F to fit the whole map. Tab moves
            between shelves; Enter or Space opens the shelf&rsquo;s details. Escape closes them.
          </p>
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
                  href={withBase(`/api/map/floorplan?v=${encodeURIComponent(settings?.updated_at ?? "")}`)}
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
                  onActivate={activateShelf}
                  onFocusShelf={ensureVisible}
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

          {/* Phones hide .map-toolbar entirely (pinch-to-zoom was the only
              way in), which leaves anyone who can't pinch — switch control,
              one hand, tremor — with no zoom at all. These float over the
              map at the same breakpoint the toolbar disappears. */}
          <div className="map-zoom-touch">
            <button
              type="button"
              className="btn"
              aria-label="Zoom in"
              style={ZOOM_TOUCH_BTN}
              onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1.3, true)}
            >
              <span aria-hidden>+</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-label="Zoom out"
              style={ZOOM_TOUCH_BTN}
              onClick={() => zoomAt({ x: viewRef.current.cx, y: viewRef.current.cy }, 1 / 1.3, true)}
            >
              <span aria-hidden>−</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-label="Fit the whole map"
              style={ZOOM_TOUCH_BTN}
              onClick={() => applyView({ cx: W / 2, cy: H / 2, z: 1 })}
            >
              <span aria-hidden>⤢</span>
            </button>
          </div>

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
                <label className="lbl" htmlFor="shelf-label">Label</label>
                <input id="shelf-label" className="input" value={sel.label} maxLength={80} onChange={(e) => updateShelf(sel.id, { label: e.target.value })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-number">Shelf number</label>
                <input id="shelf-number" className="input" value={sel.shelf_number ?? ""} maxLength={40} placeholder="e.g. 04 or R15" onChange={(e) => updateShelf(sel.id, { shelf_number: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-category">Category</label>
                <select id="shelf-category" className="input" value={sel.category} onChange={(e) => updateShelf(sel.id, { category: e.target.value as CategoryId })}>
                  {CATEGORY_IDS.map((id) => (
                    <option key={id} value={id}>
                      {CATEGORIES[id].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-letter-range">Letter range</label>
                <input id="shelf-letter-range" className="input" value={sel.letter_range ?? ""} maxLength={40} placeholder="AA–AZ" onChange={(e) => updateShelf(sel.id, { letter_range: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-details-public">Public details</label>
                <textarea id="shelf-details-public" className="input" value={sel.details_public ?? ""} maxLength={1000} placeholder="What students see when they tap this shelf" onChange={(e) => updateShelf(sel.id, { details_public: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-notes-internal">Internal notes (admins only)</label>
                <textarea id="shelf-notes-internal" className="input" value={sel.notes_internal ?? ""} maxLength={2000} placeholder="Weeding notes, condition, plans…" onChange={(e) => updateShelf(sel.id, { notes_internal: e.target.value || null })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="shelf-rotation">Rotation (°)</label>
                <input
                  id="shelf-rotation"
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
                {confirmDel ? (
                  <button className="btn danger" onClick={() => removeShelf(sel.id)}>
                    Really delete?
                  </button>
                ) : (
                  <button className="btn ghost" onClick={armDelete}>
                    Delete shelf
                  </button>
                )}
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
  onActivate,
  onFocusShelf,
}: {
  s: Shelf;
  isSel: boolean;
  showHandle: boolean;
  onDown: (e: React.PointerEvent, s: Shelf) => void;
  onDownHandle: (e: React.PointerEvent, s: Shelf) => void;
  onTip: (e: React.MouseEvent, s: Shelf) => void;
  onTipLeave: () => void;
  /** Enter/Space — the keyboard equivalent of tapping the shelf. */
  onActivate: (s: Shelf) => void;
  /** Tabbing onto an off-screen shelf pans it into view. */
  onFocusShelf: (s: Shelf) => void;
}) {
  const c = CATEGORIES[s.category]?.color ?? "#000";
  const fontSize = Math.max(14, Math.min(s.w, s.h) * 0.3);
  const numSize = Math.max(11, Math.min(s.w, s.h) * 0.16);
  return (
    // The whole shelf group is one tab stop and one button. The rect and the
    // labels inside it are decorative to AT — aria-label carries the name.
    <g
      className={isSel ? "shelf-sel" : undefined}
      transform={`rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})`}
      role="button"
      tabIndex={0}
      aria-label={shelfName(s)}
      aria-pressed={isSel}
      onFocus={() => onFocusShelf(s)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        // preventDefault stops Space scrolling the page; stopPropagation
        // keeps the map frame's view keys from also seeing it.
        e.preventDefault();
        e.stopPropagation();
        onActivate(s);
      }}
    >
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
          aria-hidden
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
        aria-hidden
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
          aria-hidden
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
