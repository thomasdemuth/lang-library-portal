"use client";

import { useEffect, useState } from "react";
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

type Size = "s" | "l";
type Prefs = {
  stats?: string[]; // which top stats show (subset of the catalog)
  hidden?: string[]; // widgets the admin removed
  order?: string[]; // widget display order; unknown ids append at the end
  size?: Record<string, Size>;
};

const KEY = "ll-dashboard";

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Prefs | null;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/**
 * The dashboard body: top stats + the widget grid, both editable in place.
 * "Customize" flips on edit chrome — toggle stats, reorder/resize/remove
 * widgets, re-add from the tray. The layout is a device preference
 * (localStorage), same as the inventory columns: widgets a Chief later
 * grants access to appear automatically, since prefs only record what was
 * explicitly hidden.
 */
export default function DashboardCards({
  kpis,
  widgets,
  defaultStats,
}: {
  kpis: DashKpi[];
  widgets: DashWidget[];
  defaultStats: string[];
}) {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [ready, setReady] = useState(false); // don't flash the default layout
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);

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
  const sizeOf = (id: string): Size => prefs.size?.[id] ?? "s";

  // ── edit actions ──
  function toggleStat(id: string) {
    const cur = new Set(statIds);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    save({ ...prefs, stats: kpis.map((k) => k.id).filter((k) => cur.has(k)) });
  }

  function commitOrder(ids: string[]) {
    save({ ...prefs, order: ids });
  }

  function move(id: string, dir: -1 | 1) {
    const ids = visible.map((w) => w.id);
    const at = ids.indexOf(id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    // keep hidden widgets' remembered positions out of the way: order = visible order + hidden at end
    commitOrder([...ids, ...tray.map((w) => w.id)]);
  }

  function remove(id: string) {
    save({ ...prefs, hidden: [...hidden, id] });
  }

  function add(id: string) {
    save({ ...prefs, hidden: hidden.filter((h) => h !== id) });
  }

  function resize(id: string) {
    const next: Size = sizeOf(id) === "s" ? "l" : "s";
    save({ ...prefs, size: { ...prefs.size, [id]: next } });
  }

  function reset() {
    save({});
  }

  if (!ready) return null;

  return (
    <>
      <div className="dash-tools">
        {editing ? (
          <>
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
        <div className="cards">
          {visible.map((w, i) => (
            <a
              className={`card navcard${sizeOf(w.id) === "l" ? " navcard-wide" : ""}${editing ? " editing" : ""}`}
              href={w.href}
              key={w.id}
              onClick={(e) => editing && e.preventDefault()}
            >
              {editing && (
                <span className="widget-ctrl" onClick={(e) => e.preventDefault()}>
                  <button type="button" title="Move earlier" disabled={i === 0} onClick={() => move(w.id, -1)}>
                    ←
                  </button>
                  <button type="button" title="Move later" disabled={i === visible.length - 1} onClick={() => move(w.id, 1)}>
                    →
                  </button>
                  <button type="button" title={sizeOf(w.id) === "s" ? "Make wide" : "Make small"} onClick={() => resize(w.id)}>
                    {sizeOf(w.id) === "s" ? "⤢" : "⤡"}
                  </button>
                  <button type="button" title="Remove widget" className="ctrl-x" onClick={() => remove(w.id)}>
                    ✕
                  </button>
                </span>
              )}
              <h2>
                <span className="navcard-icon">
                  <Ic name={w.icon} size={17} />
                </span>
                {w.title}
                {w.badge > 0 && <span className="navcard-badge">{w.badge}</span>}
                <span className="navcard-arrow" aria-hidden>→</span>
              </h2>
              <p>{w.desc}</p>
            </a>
          ))}
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
