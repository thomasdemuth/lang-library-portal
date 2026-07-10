"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function AdminFeedbackPanel() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("new");

  const load = useCallback(async () => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/feedback${qs}`);
    const data = await res.json();
    if (res.ok) {
      setItems(data.feedback);
      setNewCount(data.newCount);
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: number, status: Feedback["status"]) {
    await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
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
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            No {filter === "all" ? "" : filter + " "}feedback.
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
              <span style={{ display: "flex", gap: 6 }}>
                {f.status !== "read" && (
                  <button className="btn" onClick={() => setStatus(f.id, "read")}>
                    Mark read
                  </button>
                )}
                {f.status !== "archived" && (
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
    </>
  );
}
