"use client";

import { useEffect, useRef, useState } from "react";

/** Series colors: validated (dataviz six checks, light surface) — do not eyeball-edit. */
const C_STUDENT = "#0FA48E";
const C_STAFF = "#5565C6";

type Day = { day: string; student: number; staff: number; uniques: number };
type TopPath = { path: string; audience: string; views: number };

/** Path with only the top corners rounded (data-end), anchored to the baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export default function AnalyticsPanel() {
  const [data, setData] = useState<{ series: Day[]; topPaths: TopPath[]; kpis: { views7: number; uniques7: number } } | null>(null);
  const [days, setDays] = useState(30);
  const [tip, setTip] = useState<{ x: number; y: number; day: Day } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/admin/analytics/usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.series) setData(d);
      });
  }, [days]);

  if (!data) return <p className="hint">Loading usage…</p>;

  const { series, topPaths, kpis } = data;
  const PW = 900;
  const PH = 240;
  const PAD = { l: 36, r: 8, t: 8, b: 22 };
  const iw = PW - PAD.l - PAD.r;
  const ih = PH - PAD.t - PAD.b;
  const maxTotal = Math.max(1, ...series.map((d) => d.student + d.staff));
  const step = iw / series.length;
  const barW = Math.max(3, Math.min(26, step * 0.62));
  const yOf = (v: number) => PAD.t + ih * (1 - v / maxTotal);
  const gridVals = [maxTotal, Math.round(maxTotal / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const total = series.reduce((n, d) => n + d.student + d.staff, 0);

  return (
    <>
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <b>{kpis.views7.toLocaleString()}</b>
          <span>page views · last 7 days</span>
        </div>
        <div className="kpi">
          <b>{kpis.uniques7.toLocaleString()}</b>
          <span>daily visitors · last 7 days (approx.)</span>
        </div>
        <div className="kpi">
          <b>{total.toLocaleString()}</b>
          <span>page views · last {days} days</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Daily page views</h2>
          <span style={{ display: "flex", gap: 6 }}>
            {[14, 30, 90].map((d) => (
              <button
                key={d}
                className="btn"
                style={days === d ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </span>
        </div>
        {/* legend: identity is never color-alone; tooltips carry values */}
        <div style={{ display: "flex", gap: 16, margin: "10px 0 4px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
            <span className="dot" style={{ background: C_STUDENT }} /> Student site
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
            <span className="dot" style={{ background: C_STAFF }} /> Staff site
          </span>
        </div>

        <div ref={wrapRef} style={{ position: "relative", overflowX: "auto" }}>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: "100%", display: "block" }}>
            {gridVals.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={PW - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="#eceff4" strokeWidth={1} />
                <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end" fontSize={10} fill="#68727f">
                  {v}
                </text>
              </g>
            ))}
            <line x1={PAD.l} x2={PW - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke="#dfe3ea" strokeWidth={1} />

            {series.map((d, i) => {
              const x = PAD.l + i * step + (step - barW) / 2;
              const hStaff = (d.staff / maxTotal) * ih;
              const hStudent = (d.student / maxTotal) * ih;
              const yStaff = PAD.t + ih - hStaff;
              const yStudent = yStaff - hStudent;
              const label =
                series.length <= 16 || i % Math.ceil(series.length / 10) === 0
                  ? new Date(d.day + "T12:00:00").toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
                  : null;
              return (
                <g key={d.day}>
                  {d.staff > 0 && (
                    <rect x={x} y={yStaff} width={barW} height={hStaff} fill={C_STAFF} stroke="#fff" strokeWidth={2} />
                  )}
                  {d.student > 0 && (
                    <path d={topRoundedRect(x, yStudent, barW, hStudent, 4)} fill={C_STUDENT} stroke="#fff" strokeWidth={2} />
                  )}
                  {d.student === 0 && d.staff > 0 && (
                    <path d={topRoundedRect(x, yStaff, barW, hStaff, 4)} fill={C_STAFF} stroke="#fff" strokeWidth={2} />
                  )}
                  {/* oversized hover target */}
                  <rect
                    x={PAD.l + i * step}
                    y={PAD.t}
                    width={step}
                    height={ih}
                    fill="transparent"
                    onMouseEnter={(e) => {
                      const rect = wrapRef.current!.getBoundingClientRect();
                      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, day: d });
                    }}
                    onMouseMove={(e) => {
                      const rect = wrapRef.current!.getBoundingClientRect();
                      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, day: d });
                    }}
                    onMouseLeave={() => setTip(null)}
                  />
                  {label && (
                    <text x={PAD.l + i * step + step / 2} y={PH - 6} textAnchor="middle" fontSize={10} fill="#68727f">
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {tip && (
            <div
              style={{
                position: "absolute",
                left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 300) - 170),
                top: Math.max(tip.y - 70, 0),
                background: "#1c2330",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 11px",
                fontSize: 12,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 14px rgba(16,24,40,.25)",
              }}
            >
              <b>{new Date(tip.day.day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b>
              <div>Student site: {tip.day.student}</div>
              <div>Staff site: {tip.day.staff}</div>
              <div style={{ opacity: 0.75 }}>Total: {tip.day.student + tip.day.staff}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Most visited pages ({days}d)</h2>
        {topPaths.length === 0 ? (
          <p className="hint">No visits recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Site</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {topPaths.map((p, i) => (
                <tr key={i}>
                  <td>{p.path}</td>
                  <td>{p.audience}</td>
                  <td>{Number(p.views).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
