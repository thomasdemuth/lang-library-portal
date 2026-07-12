"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/labels";

export { STATUS_LABELS };

type MyRequest = {
  id: number;
  title: string;
  author: string | null;
  copies_requested: number;
  needed_by: string | null;
  match_status: "found" | "insufficient" | "not_found" | null;
  matched_title: string | null;
  matched_copies: number | null;
  status: string;
  created_at: string;
};

export function MatchTag({
  match_status,
  matched_title,
  matched_copies,
  copies_requested,
}: {
  match_status: MyRequest["match_status"];
  matched_title: string | null;
  matched_copies: number | null;
  copies_requested: number;
}) {
  if (match_status === "found") {
    return (
      <span className="pill" style={{ background: "#e7f6f3", color: "#175f55" }}>
        Found book · {matched_copies} {matched_copies === 1 ? "copy" : "copies"}
      </span>
    );
  }
  if (match_status === "insufficient") {
    return (
      <span className="pill" style={{ background: "#fff3e0", color: "#8a5300" }}>
        Action required · only {matched_copies} of {copies_requested}
      </span>
    );
  }
  return (
    <span className="pill" style={{ background: "#fdecec", color: "#8f1b23" }}>
      Action required · not in inventory
    </span>
  );
}

export default function RequestsPanel() {
  const [mine, setMine] = useState<MyRequest[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [copies, setCopies] = useState(1);
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  async function load() {
    const res = await fetch("/api/requests/mine");
    const data = await res.json();
    if (res.ok) setMine(data.requests);
  }
  useEffect(() => {
    load();
  }, []);

  async function deleteRequest(id: number, title: string) {
    if (!confirm(`Delete your request for “${title}”? This can't be undone.`)) return;
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't delete that request.");
      return;
    }
    load();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          author: author || undefined,
          copies,
          needed_by: neededBy || undefined,
          notes: notes || undefined,
          requester_name: name || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't submit the request.");
        return;
      }
      setResult({ status: data.match_status, message: data.message });
      setTitle("");
      setAuthor("");
      setCopies(1);
      setNeededBy("");
      setNotes("");
      load();
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>New request</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          We&rsquo;ll match your request against the library&rsquo;s current shelves.
        </p>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className={result.status === "found" ? "notice" : "error"}>
            {result.message} You&rsquo;ll find it in your requests below.
          </div>
        )}
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div className="field">
              <label className="lbl">Book title *</label>
              <input className="input" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label className="lbl">Author</label>
              <input className="input" maxLength={200} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 14 }}>
            <div className="field">
              <label className="lbl">Copies needed *</label>
              <input
                className="input"
                type="number"
                min={1}
                max={99}
                required
                value={copies}
                onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="field">
              <label className="lbl">Needed by</label>
              <input className="input" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            <div className="field">
              <label className="lbl">Your name</label>
              <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown to the library team" />
            </div>
          </div>
          <div className="field">
            <label className="lbl">Notes</label>
            <textarea className="input" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Class, grade level, edition preferences…" />
          </div>
          <button className="btn primary" disabled={busy}>
            {busy ? "Checking the shelves…" : "Submit request"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>My requests</h2>
        {mine.length === 0 ? (
          <p className="hint">Nothing yet — your submitted requests will show up here.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Copies</th>
                <th>Needed by</th>
                <th>Inventory check</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.title}</b>
                    {r.author ? <div className="hint">{r.author}</div> : null}
                  </td>
                  <td>{r.copies_requested}</td>
                  <td>{r.needed_by ?? "—"}</td>
                  <td>
                    <MatchTag
                      match_status={r.match_status}
                      matched_title={r.matched_title}
                      matched_copies={r.matched_copies}
                      copies_requested={r.copies_requested}
                    />
                  </td>
                  <td>
                    <span className="pill" style={{ background: r.status === "ready" ? "#e7f6f3" : "#eef0f5" }}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn ghost"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      onClick={() => deleteRequest(r.id, r.title)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
