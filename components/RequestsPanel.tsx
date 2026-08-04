"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/labels";
import type { NoteKind } from "@/lib/book-actions-client";

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
  admin_note: string | null;
  created_at: string;
  status_updated_at: string | null;
};

/** "Aug 3" — short enough to sit inside a table cell. */
function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  if (match_status === "not_found") {
    return (
      <span className="pill" style={{ background: "#fdecec", color: "#8f1b23" }}>
        Action required · not in inventory
      </span>
    );
  }
  // null — the shelf lookup never ran (or failed). Saying "not in inventory"
  // here would be a claim we never actually checked.
  return (
    <span className="pill" style={{ background: "#eef0f5", color: "#4a5160" }}>
      Not checked yet
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
  const [note, setNote] = useState<{ text: string; kind: NoteKind } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  function say(text: string, kind: NoteKind = "ok") {
    setNote({ text, kind });
  }

  async function load() {
    const res = await fetch("/api/requests/mine");
    const data = await res.json();
    if (res.ok) setMine(data.requests);
  }
  useEffect(() => {
    load();
  }, []);

  async function deleteRequest(id: number) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        say(data.error ?? "Couldn't delete that request.", res.status === 409 ? "warn" : "err");
        return;
      }
      setConfirmId(null);
      say("Request withdrawn.", "info");
      load();
    } finally {
      setDeleting(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
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
        // 409 = you already asked for this. That's a nudge, not a failure.
        say(data.error ?? "Couldn't submit the request.", res.status === 409 ? "warn" : "err");
        if (res.status === 409) load();
        return;
      }
      say(`${data.message} You'll find it in your requests below.`, data.kind ?? "ok");
      setTitle("");
      setAuthor("");
      setCopies(1);
      setNeededBy("");
      setNotes("");
      load();
    } catch {
      say("Couldn't reach the server — try again.", "err");
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
        {note && (
          <div
            className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`}
            role="status"
            aria-live="polite"
          >
            {note.text}
          </div>
        )}
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div className="field">
              <label className="lbl" htmlFor="req-title">Book title *</label>
              <input id="req-title" className="input" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="req-author">Author</label>
              <input id="req-author" className="input" maxLength={200} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 14 }}>
            <div className="field">
              <label className="lbl" htmlFor="req-copies">Copies needed *</label>
              <input
                id="req-copies"
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
              <label className="lbl" htmlFor="req-needed-by">Needed by</label>
              <input id="req-needed-by" className="input" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="req-name">Your name</label>
              <input id="req-name" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown to the library team" />
            </div>
          </div>
          <div className="field">
            <label className="lbl" htmlFor="req-notes">Notes</label>
            <textarea id="req-notes" className="input" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Class, grade level, edition preferences…" />
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
                    {r.admin_note ? (
                      <div className="hint" style={{ marginTop: 4, fontStyle: "italic" }}>
                        Note from the library: {r.admin_note}
                      </div>
                    ) : null}
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
                    <div className="hint" style={{ marginTop: 4 }}>
                      {r.status_updated_at
                        ? `Updated ${shortDay(r.status_updated_at)}`
                        : `Sent ${shortDay(r.created_at)}`}
                    </div>
                  </td>
                  <td>
                    {/* Only an untouched request can be withdrawn — once the
                        library is on it, there's work attached to the row. */}
                    {r.status !== "new" ? null : confirmId === r.id ? (
                      <span className="modal-confirm">
                        <span className="hint" style={{ margin: 0 }}>Withdraw?</span>
                        <button
                          className="btn danger"
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          disabled={deleting === r.id}
                          onClick={() => deleteRequest(r.id)}
                        >
                          {deleting === r.id ? "…" : "Yes"}
                        </button>
                        <button
                          className="btn ghost"
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          disabled={deleting === r.id}
                          onClick={() => setConfirmId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        className="btn ghost"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => setConfirmId(r.id)}
                      >
                        Delete
                      </button>
                    )}
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
