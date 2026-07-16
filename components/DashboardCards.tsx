"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ic, Pencil } from "@/components/icons";

export type DashKpi = { id: string; value: string; label: string };
export type DashWidget = {
  id: string;
  href: string;
  icon: string;
  badge: number;
  title: string;
  desc: string;
};

/** Live preview data, gathered server-side per permission. */
export type DashPeeks = {
  requests?: { title: string; status: string; at: string }[];
  feedback?: { text: string; audience: string; at: string }[];
  usage?: { day: string; count: number }[];
  readers?: { name: string; count: number }[];
  shelves?: number;
  admins?: number;
};

type Size = { w: number; h: number };
type Prefs = {
  stats?: string[]; // which top stats show
  hidden?: string[]; // widgets the admin removed
  order?: string[]; // widget display order; unknown ids append at the end
  size?: Record<string, Size | "s" | "l">; // "s"/"l" are the old one-dimensional sizes
};

const KEY = "ll-dashboard";
const ROW_H = 148; // grid row height (px) — keep in sync with .dashgrid CSS
const GAP = 16;
const MAX_H = 4;

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Prefs | null;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Old prefs stored "s"/"l"; everything is {w,h} now. */
function asSize(v: Size | "s" | "l" | undefined): Size {
  if (!v || v === "s") return { w: 1, h: 1 };
  if (v === "l") return { w: 2, h: 1 };
  return { w: Math.max(1, v.w || 1), h: Math.max(1, v.h || 1) };
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
}

/**
 * The dashboard body: top stats + a snap-to-grid widget board.
 * In edit mode, widgets drag to reorder (a floating clone follows the
 * pointer; the grid reflows live underneath) and resize from the corner
 * grip, snapping to whole grid cells. Big-enough widgets show a live
 * peek of their page — recent requests, a usage sparkline, an inventory
 * search box — instead of their description line.
 * Layout is a device preference (localStorage); prefs record only what
 * was hidden, so newly granted pages appear automatically.
 */
export default function DashboardCards({
  kpis,
  widgets,
  peeks,
  defaultStats,
}: {
  kpis: DashKpi[];
  widgets: DashWidget[];
  peeks: DashPeeks;
  defaultStats: string[];
}) {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [ready, setReady] = useState(false); // don't flash the default layout
  const [editing, setEditing] = useState(false);
  const [cols, setCols] = useState(3);
  const [dragId, setDragId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    clone: HTMLElement;
    dx: number; // pointer offset inside the card
    dy: number;
    lastOver: string | null;
  } | null>(null);
  const resize = useRef<{ id: string; startX: number; startY: number; w: number; h: number } | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

  // Column count follows the container, so spans snap to real cells.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      setCols(w >= 1060 ? 4 : w >= 780 ? 3 : w >= 540 ? 2 : 1);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  function save(next: Prefs) {
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  // ── resolve prefs against what this admin can actually see ──
  const statIds = prefs.stats ?? defaultStats;
  const shownKpis = kpis.filter((k) => statIds.includes(k.id));

  const order = prefs.order ?? [];
  const ordered = [
    ...order.map((id) => widgets.find((w) => w.id === id)).filter((w): w is DashWidget => !!w),
    ...widgets.filter((w) => !order.includes(w.id)),
  ];
  const hidden = prefs.hidden ?? [];
  const visible = ordered.filter((w) => !hidden.includes(w.id));
  const tray = ordered.filter((w) => hidden.includes(w.id));
  const sizeOf = (id: string): Size => {
    if (resizing?.id === id) return { w: resizing.w, h: resizing.h };
    return asSize(prefs.size?.[id]);
  };

  // ── edit actions ──
  function toggleStat(id: string) {
    const cur = new Set(statIds);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    save({ ...prefs, stats: kpis.map((k) => k.id).filter((k) => cur.has(k)) });
  }

  function remove(id: string) {
    save({ ...prefs, hidden: [...hidden, id] });
  }

  function add(id: string) {
    save({ ...prefs, hidden: hidden.filter((h) => h !== id) });
  }

  function reset() {
    save({});
  }

  // ── drag to move ──
  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (!editing || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, input, a.peek-link, .widget-resize")) return;
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();

    const clone = card.cloneNode(true) as HTMLElement;
    clone.classList.add("drag-clone");
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    document.body.appendChild(clone);

    drag.current = { id, clone, dx: e.clientX - rect.left, dy: e.clientY - rect.top, lastOver: null };
    setDragId(id);
    try {
      card.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    d.clone.style.left = `${e.clientX - d.dx}px`;
    d.clone.style.top = `${e.clientY - d.dy}px`;

    const under = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-wid]");
    const overId = under?.dataset.wid ?? null;
    if (!overId || overId === d.id || overId === d.lastOver) return;
    d.lastOver = overId;

    const ids = visible.map((w) => w.id);
    const from = ids.indexOf(d.id);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, d.id);
    save({ ...prefs, order: [...ids, ...tray.map((w) => w.id)] });
  }

  function onCardPointerUp() {
    const d = drag.current;
    if (!d) return;
    d.clone.remove();
    drag.current = null;
    setDragId(null);
  }

  // ── corner drag to resize ──
  function onGripPointerDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (!editing || e.button !== 0) return;
    const s = sizeOf(id);
    resize.current = { id, startX: e.clientX, startY: e.clientY, w: s.w, h: s.h };
    setResizing({ id, w: s.w, h: s.h });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  }

  function onGripPointerMove(e: React.PointerEvent<HTMLElement>) {
    const r = resize.current;
    const grid = gridRef.current;
    if (!r || !grid) return;
    const cellW = (grid.clientWidth - GAP * (cols - 1)) / cols;
    const w = Math.max(1, Math.min(cols, r.w + Math.round((e.clientX - r.startX) / (cellW + GAP))));
    const h = Math.max(1, Math.min(MAX_H, r.h + Math.round((e.clientY - r.startY) / (ROW_H + GAP))));
    setResizing((cur) => (cur && (cur.w !== w || cur.h !== h) ? { ...cur, w, h } : cur));
  }

  function onGripPointerUp() {
    const r = resize.current;
    if (!r) return;
    setResizing((cur) => {
      if (cur) save({ ...prefs, size: { ...prefs.size, [r.id]: { w: cur.w, h: cur.h } } });
      return null;
    });
    resize.current = null;
  }

  if (!ready) return null;

  return (
    <>
      <div className="dash-tools">
        {editing ? (
          <>
            <span className="hint" style={{ margin: 0 }}>
              Drag a widget to move it · drag the corner to resize
            </span>
            <button type="button" className="linklike" onClick={reset}>
              Reset layout
            </button>
            <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setEditing(false)}>
              Done
            </button>
          </>
        ) : (
          <button type="button" className="tagchip" onClick={() => setEditing(true)}>
            <Pencil size={12} /> Customize
          </button>
        )}
      </div>

      {editing && (
        <div className="card dash-statpick">
          <b>Top stats</b>
          <div className="tagpicker" style={{ marginTop: 8 }}>
            {kpis.map((k) => {
              const on = statIds.includes(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  className={`tagchip${on ? " active" : ""}`}
                  style={on ? { background: "var(--brand-blue)", borderColor: "var(--brand-blue)", color: "#fff" } : undefined}
                  onClick={() => toggleStat(k.id)}
                >
                  {on ? "✓ " : "+ "}
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shownKpis.length > 0 && (
        <div className="kpis" style={{ marginBottom: 22 }}>
          {shownKpis.map((k) => (
            <div className="kpi" key={k.id}>
              <b>{k.value}</b>
              <span>{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 ? (
        <div className="cards dashgrid" ref={gridRef}>
          {visible.map((w) => {
            const s = sizeOf(w.id);
            const wSpan = Math.min(s.w, cols);
            const big = wSpan >= 2 || s.h >= 2;
            return (
              <a
                className={[
                  "card navcard dashcard",
                  editing ? "editing" : "",
                  dragId === w.id ? "drag-src" : "",
                  resizing?.id === w.id ? "resizing" : "",
                ].join(" ").trim()}
                style={{ gridColumn: `span ${wSpan}`, gridRow: `span ${s.h}` }}
                href={w.href}
                key={w.id}
                data-wid={w.id}
                onClick={(e) => editing && e.preventDefault()}
                onPointerDown={(e) => onCardPointerDown(e, w.id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerUp}
              >
                {editing && (
                  <>
                    <button
                      type="button"
                      className="widget-x"
                      title="Remove widget"
                      onClick={(e) => {
                        e.preventDefault();
                        remove(w.id);
                      }}
                    >
                      ✕
                    </button>
                    <span
                      className="widget-resize"
                      title="Drag to resize"
                      onPointerDown={(e) => onGripPointerDown(e, w.id)}
                      onPointerMove={onGripPointerMove}
                      onPointerUp={onGripPointerUp}
                      onPointerCancel={onGripPointerUp}
                    />
                    {resizing?.id === w.id && (
                      <span className="widget-size-badge">
                        {resizing.w}×{resizing.h}
                      </span>
                    )}
                  </>
                )}
                <h2>
                  <span className="navcard-icon">
                    <Ic name={w.icon} size={17} />
                  </span>
                  {w.title}
                  {w.badge > 0 && <span className="navcard-badge">{w.badge}</span>}
                  <span className="navcard-arrow" aria-hidden>→</span>
                </h2>
                {big ? <Peek widget={w} size={{ w: wSpan, h: s.h }} peeks={peeks} editing={editing} /> : <p>{w.desc}</p>}
              </a>
            );
          })}
        </div>
      ) : (
        !editing && (
          <div className="card">
            <p className="hint" style={{ margin: 0 }}>
              Every widget is hidden — tap <b>Customize</b> to bring some back.
            </p>
          </div>
        )
      )}

      {editing && tray.length > 0 && (
        <div className="card dash-tray">
          <b>Add widgets</b>
          <div className="tagpicker" style={{ marginTop: 8 }}>
            {tray.map((w) => (
              <button key={w.id} type="button" className="tagchip" onClick={() => add(w.id)}>
                + {w.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** What a widget shows once it has room: a live slice of its page. */
function Peek({
  widget,
  size,
  peeks,
  editing,
}: {
  widget: DashWidget;
  size: Size;
  peeks: DashPeeks;
  editing: boolean;
}) {
  const rows = size.h >= 2 ? 5 : 2;

  if (widget.id === "inventory") {
    return <InventorySearch editing={editing} />;
  }

  if (widget.id === "requests" && peeks.requests) {
    return peeks.requests.length === 0 ? (
      <p>No requests yet — all caught up.</p>
    ) : (
      <div className="peek-rows">
        {peeks.requests.slice(0, rows).map((r, i) => (
          <div className="peek-row" key={i}>
            <b>{r.title}</b>
            <span className={`upill status-${r.status}`}>{r.status}</span>
            <span className="peek-ago">{ago(r.at)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.id === "feedback" && peeks.feedback) {
    return peeks.feedback.length === 0 ? (
      <p>No feedback yet.</p>
    ) : (
      <div className="peek-rows">
        {peeks.feedback.slice(0, rows).map((f, i) => (
          <div className="peek-row" key={i}>
            <b className="peek-quote">“{f.text.length > 90 ? `${f.text.slice(0, 90)}…` : f.text}”</b>
            <span className="peek-ago">{ago(f.at)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.id === "analytics" && peeks.usage) {
    const max = Math.max(1, ...peeks.usage.map((u) => u.count));
    const today = peeks.usage[peeks.usage.length - 1]?.count ?? 0;
    return (
      <div className="peek-chart">
        <svg viewBox={`0 0 ${peeks.usage.length * 14} 44`} preserveAspectRatio="none" aria-hidden>
          {peeks.usage.map((u, i) => {
            const h = Math.max(2, (u.count / max) * 40);
            return <rect key={u.day} x={i * 14 + 2} y={44 - h} width={10} height={h} rx={2} />;
          })}
        </svg>
        <span className="hint" style={{ margin: 0 }}>
          {today} page views today · last 14 days
        </span>
      </div>
    );
  }

  if (widget.id === "users" && peeks.readers) {
    return peeks.readers.length === 0 ? (
      <p>No books logged this week yet.</p>
    ) : (
      <div className="peek-rows">
        {peeks.readers.slice(0, rows).map((r, i) => (
          <div className="peek-row" key={i}>
            <b>{r.name}</b>
            <span className="peek-ago">
              {r.count} book{r.count === 1 ? "" : "s"} this week
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.id === "map" && peeks.shelves !== undefined) {
    return (
      <p>
        <b style={{ fontSize: 22, color: "var(--brand-blue-deep)" }}>{peeks.shelves}</b> shelves placed on the floor plan.
      </p>
    );
  }

  if (widget.id === "admins" && peeks.admins !== undefined) {
    return (
      <p>
        <b style={{ fontSize: 22, color: "var(--brand-blue-deep)" }}>{peeks.admins}</b> active admin account
        {peeks.admins === 1 ? "" : "s"}.
      </p>
    );
  }

  return <p>{widget.desc}</p>;
}

/** The inventory widget's search box: submits straight into the catalog. */
function InventorySearch({ editing }: { editing: boolean }) {
  const [q, setQ] = useState("");
  function go() {
    if (editing) return;
    window.location.href = `/admin/inventory${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  }
  return (
    <div className="peek-search" onClick={(e) => e.preventDefault()}>
      <input
        className="input"
        placeholder="Search the catalog…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="btn" onClick={go} disabled={editing} title="Search inventory">
        <Ic name="search" size={15} />
      </button>
    </div>
  );
}
