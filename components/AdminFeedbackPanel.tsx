"use client";

import { useCallback, useEffect, useState } from "react";
import { withBase } from "@/lib/base";

type Feedback = {
  id: number;
  audience: "student" | "staff";
  email: string;
  name: string | null;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
};

const FILTERS = ["new", "read", "archived", "all"] as const;

export default function AdminFeedbackPanel({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Feedback[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("new");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (offset = 0) => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (q.trim()) params.set("q", q.trim());
      if (offset > 0) params.set("offset", String(offset));
      const qs = params.toString();
      try {
        const res = await fetch(withBase(`/api/admin/feedback${qs ? `?${qs}` : ""}`));
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't load feedback.");
          return;
        }
        setItems((cur) => (offset > 0 ? [...cur, ...data.feedback] : data.feedback));
        setNewCount(data.newCount);
        setTotal(data.total ?? data.feedback.length);
      } catch {
        setError("Couldn't reach the server — try again.");
      }
    },
    [filter, q]
  );

  // Reload on filter change immediately; debounce while typing a search.
  useEffect(() => {
    const t = setTimeout(() => load(0), q.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function setStatus(id: number, status: Feedback["status"]) {
    setError(null);
    try {
      const res = await fetch(withBase(`/api/admin/feedback/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update that feedback — try again.");
      }
    } catch {
      setError("Couldn't reach the server — that feedback wasn't updated.");
    }
    load();
  }

  async function showMore() {
    setLoadingMore(true);
    try {
      await load(items.length);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className="btn"
            style={filter === f ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
            {f === "new" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
        <input
          className="input"
          type="search"
          style={{ maxWidth: 260, marginLeft: "auto" }}
          placeholder="Search messages…"
          aria-label="Search feedback messages"
          value={q}
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <p className="hint" style={{ margin: "0 0 12px" }}>
        Showing {items.length} of {total}
        {q.trim() ? ` matching “${q.trim()}”` : ""}
        {filter === "all" ? "" : ` ${filter}`} feedback item{total === 1 ? "" : "s"}.
      </p>

      {items.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            No {filter === "all" ? "" : filter + " "}feedback{q.trim() ? ` matching “${q.trim()}”` : ""}.
          </p>
        </div>
      ) : (
        items.map((f) => (
          <div className="card" key={f.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <p className="hint" style={{ margin: 0 }}>
                <span
                  className="pill"
                  style={{ background: f.audience === "student" ? "#e9f0fd" : "#e7f6f3", marginRight: 8 }}
                >
                  {f.audience}
                </span>
                {f.name ? `${f.name} · ` : ""}
                {f.email} · {new Date(f.created_at).toLocaleString()}
              </p>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {f.email && (
                  <a
                    className="btn"
                    href={`mailto:${f.email}?subject=${encodeURIComponent("Re: your Lang Library feedback")}`}
                  >
                    Reply by email
                  </a>
                )}
                {canManage && f.status !== "read" && (
                  <button className="btn" onClick={() => setStatus(f.id, "read")}>
                    Mark read
                  </button>
                )}
                {canManage && f.status !== "archived" && (
                  <button className="btn ghost" onClick={() => setStatus(f.id, "archived")}>
                    Archive
                  </button>
                )}
              </span>
            </div>
            <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{f.message}</p>
          </div>
        ))
      )}

      {items.length < total && (
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button className="btn" onClick={showMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Show more (${total - items.length} left)`}
          </button>
        </div>
      )}
    </>
  );
}
