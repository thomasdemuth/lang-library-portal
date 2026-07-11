"use client";

import { useCallback, useEffect, useState } from "react";
import { MatchTag, STATUS_LABELS } from "@/components/RequestsPanel";

type AdminRequest = {
  id: number;
  requester_email: string;
  requester_name: string | null;
  title: string;
  author: string | null;
  copies_requested: number;
  needed_by: string | null;
  notes: string | null;
  match_status: "found" | "insufficient" | "not_found" | null;
  matched_title: string | null;
  matched_copies: number | null;
  match_candidates: { title: string; creators: string | null; copies: number; score: number }[] | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  reminder_sent_at: string | null;
};

const FILTERS = ["all", "new", "in_progress", "ordered", "ready", "declined"] as const;

export default function AdminRequestsPanel() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/requests${qs}`);
    const data = await res.json();
    if (res.ok) {
      setRequests(data.requests);
      setNewCount(data.newCount);
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: number, body: { status?: string; admin_note?: string | null }) {
    setError(null);
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error ?? "Couldn't update the request.");
    load();
  }

  async function deleteRequest(id: number, title: string) {
    if (!confirm(`Delete request #${id} (“${title}”)? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/requests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't delete the request.");
      return;
    }
    load();
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className="btn"
            style={
              filter === f
                ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }
                : undefined
            }
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            {f === "new" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            No requests {filter === "all" ? "yet" : `with status “${STATUS_LABELS[filter]}”`}.
          </p>
        </div>
      ) : (
        requests.map((r) => (
          <div className="card" key={r.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: "0 0 4px" }}>
                  #{r.id} · {r.title}
                  {r.author ? <span style={{ color: "var(--muted)", fontWeight: 500 }}> — {r.author}</span> : null}
                </h2>
                <p className="hint" style={{ margin: 0 }}>
                  {r.copies_requested} cop{r.copies_requested === 1 ? "y" : "ies"} ·{" "}
                  {r.requester_name ? `${r.requester_name} · ` : ""}
                  {r.requester_email} · submitted {new Date(r.created_at).toLocaleDateString()}
                  {r.needed_by ? ` · needed by ${r.needed_by}` : ""}
                  {r.reminder_sent_at ? " · ⏰ reminder sent" : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <MatchTag
                  match_status={r.match_status}
                  matched_title={r.matched_title}
                  matched_copies={r.matched_copies}
                  copies_requested={r.copies_requested}
                />
                <select
                  className="input"
                  style={{ width: "auto", padding: "7px 10px" }}
                  value={r.status}
                  onChange={(e) => patch(r.id, { status: e.target.value })}
                >
                  {Object.entries(STATUS_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setOpen(open === r.id ? null : r.id);
                    setNoteDraft(r.admin_note ?? "");
                  }}
                >
                  {open === r.id ? "Close" : "Details"}
                </button>
              </div>
            </div>

            {r.match_status === "found" && r.matched_title && (
              <p className="hint" style={{ margin: "8px 0 0" }}>
                Matched: “{r.matched_title}” — {r.matched_copies} in inventory.
              </p>
            )}

            {open === r.id && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                {r.notes && (
                  <p style={{ marginTop: 0 }}>
                    <b>Teacher notes:</b> {r.notes}
                  </p>
                )}
                {r.match_candidates && r.match_candidates.length > 0 && (
                  <>
                    <p style={{ margin: "0 0 6px" }}>
                      <b>Closest inventory matches:</b>
                    </p>
                    <table className="table" style={{ marginBottom: 14 }}>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Creators</th>
                          <th>Copies</th>
                          <th>Match score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.match_candidates.map((c, i) => (
                          <tr key={i}>
                            <td>{c.title}</td>
                            <td>{c.creators ?? "—"}</td>
                            <td>{c.copies}</td>
                            <td>{Math.round(c.score * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <div className="field">
                  <label className="lbl">Internal note</label>
                  <textarea
                    className="input"
                    value={noteDraft}
                    maxLength={2000}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Ordered 4 from Ingram, ETA next week…"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <button className="btn" onClick={() => patch(r.id, { admin_note: noteDraft || null })}>
                    Save note
                  </button>
                  <button className="btn ghost" onClick={() => deleteRequest(r.id, r.title)}>
                    Delete request
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
