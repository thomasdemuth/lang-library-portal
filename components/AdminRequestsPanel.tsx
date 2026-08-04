"use client";

import { useCallback, useEffect, useState } from "react";
import { announce } from "@/components/Announcer";
import { MatchTag, STATUS_LABELS } from "@/components/RequestsPanel";
import type { NoteKind } from "@/lib/book-actions-client";
import {
  ALLOWED_TRANSITIONS,
  isRequestStatus,
  transitionError,
  type RequestStatus,
} from "@/lib/request-status";

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

/** These two send mail to the teacher, so they get a confirm step. */
const NOTIFYING: RequestStatus[] = ["ready", "declined"];

/** Board layout (v8): Ordered lives inside "In progress" as a sub-state chip. */
const BOARD_COLUMNS: { drop: RequestStatus; label: string; statuses: RequestStatus[] }[] = [
  { drop: "new", label: "New", statuses: ["new"] },
  { drop: "in_progress", label: "In progress", statuses: ["in_progress", "ordered"] },
  { drop: "ready", label: "Ready", statuses: ["ready"] },
];

const VIEW_KEY = "admin-requests-view";

export default function AdminRequestsPanel({ canDelete }: { canDelete: boolean }) {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [declinedOpen, setDeclinedOpen] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [note, setNote] = useState<{ text: string; kind: NoteKind } | null>(null);
  /** The teacher-emailing status change awaiting a second click. */
  const [pending, setPending] = useState<{ id: number; status: RequestStatus; note: string } | null>(null);
  /** Request id currently mid-PATCH — its select is frozen (double-fire guard). */
  const [saving, setSaving] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  /** Card id currently being dragged / column key currently hovered. */
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Restore the last-used view (defaults to the board).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "table" || stored === "board") setView(stored);
    } catch {
      /* private mode etc. — keep the default */
    }
  }, []);

  function switchView(v: "board" | "table") {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* non-fatal */
    }
  }

  function say(text: string, kind: NoteKind = "ok") {
    setNote({ text, kind });
    // Screen-reader channel (visual notice below is display-only).
    announce(text, kind === "err");
  }

  const load = useCallback(async () => {
    // The board always shows every status; the filter belongs to the table.
    const qs = view === "table" && filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/admin/requests${qs}`);
    const data = await res.json();
    if (res.ok) {
      setRequests(data.requests);
      setNewCount(data.newCount);
    }
  }, [filter, view]);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: number, body: { status?: string; admin_note?: string | null }) {
    if (saving !== null) return;
    setNote(null);
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 = the lifecycle refused this move; that's a rule, not a crash.
        // Nothing was saved either way, so drop the confirm and let the
        // reload snap the select back to the row's real status.
        say(data.error ?? "Couldn't update the request.", res.status === 409 ? "warn" : "err");
        setPending(null);
        return;
      }
      // Delivery feedback: the status is saved either way, but a teacher who
      // never got the email is a teacher standing at an empty desk.
      if (data.emailed === true) say(`Emailed ${data.notified_to ?? "the teacher"}.`, "ok");
      else if (data.emailed === false) say("Status saved — email didn't send.", "warn");
      else say("Saved.", "ok");
      setPending(null);
    } catch {
      say("Couldn't reach the server — try again.", "err");
    } finally {
      setSaving(null);
      load();
    }
  }

  /**
   * The single status-change entry point — the table select, the board's
   * "Move to…" select, and a board drop all land here, so the Ready/Declined
   * confirm-with-note step can never be bypassed.
   */
  function pickStatus(r: AdminRequest, next: string) {
    if (!isRequestStatus(next) || next === r.status) return;
    if (NOTIFYING.includes(next)) {
      setPending({ id: r.id, status: next, note: r.admin_note ?? "" });
      setNote(null);
      return;
    }
    patch(r.id, { status: next });
  }

  async function deleteRequest(id: number) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, { method: "DELETE" });
      if (!res.ok) {
        say((await res.json().catch(() => ({}))).error ?? "Couldn't delete the request.", "err");
        return;
      }
      setConfirmDelete(null);
      say("Request deleted.", "info");
    } finally {
      setSaving(null);
      load();
    }
  }

  // ── Drag layer (board only). Drops route through pickStatus above. ──
  function allowDrop(e: React.DragEvent) {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function dropOn(target: RequestStatus, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/plain")) || dragId;
    setDragId(null);
    const r = requests.find((x) => x.id === id);
    if (!r) return;
    const from: RequestStatus = isRequestStatus(r.status) ? r.status : "new";
    if (from === target) return;
    // The board folds `ordered` into the In-progress column, so a card dropped
    // back into the column it is already sitting in must change nothing —
    // otherwise a nudge that looks like a no-op quietly demotes an Ordered
    // request to In progress (and loses its "Ordered" chip).
    const col = BOARD_COLUMNS.find((c) => c.drop === target);
    if (col && (col.statuses as string[]).includes(from)) return;
    const err = transitionError(from, target);
    if (err) {
      // Same wording the server's 409 would use — but caught before a network trip.
      say(err, "warn");
      return;
    }
    pickStatus(r, target);
  }

  /** Status select — table row and board card share it via pickStatus. */
  function statusSelect(r: AdminRequest, label: string, compact = false) {
    const from: RequestStatus = isRequestStatus(r.status) ? r.status : "new";
    const confirming = pending?.id === r.id ? pending : null;
    const busy = saving === r.id;
    return (
      <select
        className={`input${compact ? " rboard-move" : ""}`}
        style={compact ? undefined : { width: "auto", padding: "7px 10px" }}
        aria-label={label}
        value={confirming?.status ?? r.status}
        disabled={busy}
        onChange={(e) => pickStatus(r, e.target.value)}
      >
        {Object.entries(STATUS_LABELS).map(([v, optLabel]) => (
          <option
            key={v}
            value={v}
            disabled={v !== r.status && !ALLOWED_TRANSITIONS[from].includes(v as RequestStatus)}
          >
            {optLabel}
          </option>
        ))}
      </select>
    );
  }

  /**
   * Ready / Declined email the teacher. Show exactly what they'll get —
   * including the note, editable right here — before it goes. Rendered inside
   * the request's card in both views.
   */
  function confirmBox(r: AdminRequest) {
    const confirming = pending?.id === r.id ? pending : null;
    if (!confirming) return null;
    const busy = saving === r.id;
    return (
      <div
        className="notice warn"
        style={{ marginTop: 12 }}
        role="group"
        aria-label="Confirm status change"
      >
        <p style={{ margin: "0 0 8px" }}>
          Mark <b>{STATUS_LABELS[confirming.status]}</b> and email{" "}
          <b>{r.requester_name ?? r.requester_email}</b>?
        </p>
        <div className="field" style={{ marginBottom: 8 }}>
          <label className="lbl" htmlFor={`req-${r.id}-email-note`}>
            Note to include in the email (optional)
          </label>
          <textarea
            id={`req-${r.id}-email-note`}
            className="input"
            value={confirming.note}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setPending({ ...confirming, note: e.target.value })}
            placeholder={
              confirming.status === "ready"
                ? "On the hold shelf under your name…"
                : "Out of print — happy to suggest alternatives…"
            }
          />
        </div>
        <span className="modal-confirm">
          <button
            className="btn brand"
            disabled={busy}
            onClick={() =>
              patch(r.id, {
                status: confirming.status,
                admin_note: confirming.note.trim() || null,
              })
            }
          >
            {busy ? "Sending…" : `Yes, mark ${STATUS_LABELS[confirming.status]} & email`}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

  /** One compact board card. Drag is sugar — the select is the real control. */
  function boardCard(r: AdminRequest) {
    const busy = saving === r.id;
    // "We own N": only claimed when the shelf check actually ran.
    const own =
      r.match_status === "found" || r.match_status === "insufficient"
        ? r.matched_copies
        : r.match_status === "not_found"
          ? 0
          : null;
    return (
      <div
        key={r.id}
        className={`card rboard-card${dragId === r.id ? " dragging" : ""}`}
        draggable={!busy}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(r.id));
          e.dataTransfer.effectAllowed = "move";
          setDragId(r.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDragOver(null);
        }}
      >
        <p className="rboard-title">
          {r.title}
          {r.status === "ordered" && <span className="pill rboard-sub">Ordered</span>}
        </p>
        <p className="hint rboard-cap">
          {r.requester_name ?? r.requester_email} · {r.copies_requested} cop
          {r.copies_requested === 1 ? "y" : "ies"}
          {own !== null ? ` · we own ${own}` : ""}
        </p>
        {r.needed_by && <p className="rboard-warnline">Needed by {r.needed_by}</p>}
        {r.reminder_sent_at && <p className="hint rboard-cap">⏰ reminder sent</p>}
        <div className="rboard-moverow">
          <span className="lbl" aria-hidden>
            Move to…
          </span>
          {statusSelect(r, `Move request “${r.title}” to…`, true)}
        </div>
        {confirmBox(r)}
      </div>
    );
  }

  const declined = requests.filter((r) => r.status === "declined");

  return (
    <>
      {note && (
        <div className={`notice${note.kind === "ok" ? "" : ` ${note.kind}`}`} style={{ marginBottom: 12 }}>
          {note.text}
        </div>
      )}

      <div
        style={{ display: "flex", gap: 6, marginBottom: 12 }}
        role="group"
        aria-label="Requests view"
      >
        {(["board", "table"] as const).map((v) => (
          <button
            key={v}
            className="btn"
            aria-pressed={view === v}
            style={
              view === v
                ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }
                : undefined
            }
            onClick={() => switchView(v)}
          >
            {v === "board" ? "Board" : "Table"}
          </button>
        ))}
      </div>

      {view === "table" && (
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
      )}

      {view === "board" ? (
        requests.length === 0 ? (
          <div className="card">
            <p className="hint" style={{ margin: 0 }}>
              No requests yet.
            </p>
          </div>
        ) : (
          <>
            <div className="rboard">
              {BOARD_COLUMNS.map((col) => {
                const cards = requests.filter((r) =>
                  (col.statuses as string[]).includes(r.status)
                );
                return (
                  <section
                    key={col.drop}
                    className={`rboard-col${dragOver === col.drop ? " dragover" : ""}`}
                    aria-label={`${col.label} — ${cards.length}`}
                    onDragOver={(e) => {
                      allowDrop(e);
                      if (dragId !== null) setDragOver(col.drop);
                    }}
                    onDragLeave={() => setDragOver((d) => (d === col.drop ? null : d))}
                    onDrop={(e) => dropOn(col.drop, e)}
                  >
                    <h2 className="rboard-colhead">
                      {col.label} <span className="rboard-count">{cards.length}</span>
                    </h2>
                    {cards.map(boardCard)}
                    {cards.length === 0 && (
                      <p className="hint rboard-empty">Nothing here.</p>
                    )}
                  </section>
                );
              })}
            </div>

            <div
              className={`rboard-declined${dragOver === "declined" ? " dragover" : ""}`}
              onDragOver={(e) => {
                allowDrop(e);
                if (dragId !== null) setDragOver("declined");
              }}
              onDragLeave={() => setDragOver((d) => (d === "declined" ? null : d))}
              onDrop={(e) => dropOn("declined", e)}
            >
              <button
                className="btn ghost rboard-declined-toggle"
                aria-expanded={declinedOpen}
                onClick={() => setDeclinedOpen((o) => !o)}
              >
                Declined · {declined.length} {declinedOpen ? "▴" : "▾"}
              </button>
              {declinedOpen &&
                (declined.length === 0 ? (
                  <p className="hint rboard-empty">No declined requests.</p>
                ) : (
                  <div className="rboard-declinedlist">{declined.map(boardCard)}</div>
                ))}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Drag a card between columns, or use its “Move to…” menu — Ready and Declined
              always confirm before emailing the teacher.
            </p>
          </>
        )
      ) : requests.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            No requests {filter === "all" ? "yet" : `with status “${STATUS_LABELS[filter]}”`}.
          </p>
        </div>
      ) : (
        requests.map((r) => {
          const busy = saving === r.id;
          return (
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
                  {statusSelect(r, `Status of request #${r.id}`)}
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

              {confirmBox(r)}

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
                    <label className="lbl" htmlFor={`req-${r.id}-admin-note`}>Note for this request</label>
                    <textarea
                      id={`req-${r.id}-admin-note`}
                      className="input"
                      value={noteDraft}
                      maxLength={2000}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Ordered 4 from Ingram, ETA next week…"
                      aria-describedby={`req-${r.id}-admin-note-hint`}
                    />
                    <p className="hint" id={`req-${r.id}-admin-note-hint`} style={{ margin: "4px 0 0" }}>
                      The teacher can see this on their requests page, and it&rsquo;s included in the
                      Ready / Declined email.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => patch(r.id, { admin_note: noteDraft || null })}
                    >
                      Save note
                    </button>
                    {canDelete &&
                      (confirmDelete === r.id ? (
                        <span className="modal-confirm">
                          <span className="hint" style={{ margin: 0 }}>Delete request #{r.id}?</span>
                          <button className="btn danger" disabled={busy} onClick={() => deleteRequest(r.id)}>
                            {busy ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button className="btn ghost" disabled={busy} onClick={() => setConfirmDelete(null)}>
                            No
                          </button>
                        </span>
                      ) : (
                        <button className="btn ghost" onClick={() => setConfirmDelete(r.id)}>
                          Delete request
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
