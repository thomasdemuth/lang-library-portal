"use client";

import { useEffect, useRef, useState } from "react";
import { announce } from "@/components/Announcer";
import CirculationDesk from "@/components/CirculationDesk";
import {
  DEFAULT_EMAIL_MODE,
  dueLabel,
  EMAIL_MODE_LABELS,
  EMAIL_MODES,
  isOverdue,
  outLabel,
  SOFT_LIMIT,
  type EmailMode,
} from "@/lib/circulation";
import { displayNameFull } from "@/lib/play";
import { withBase } from "@/lib/base";

type Row = {
  id: number;
  book_key: string;
  title: string;
  isbn13: string | null;
  student_email: string;
  checked_out_by: string;
  checked_out_via: "student" | "staff" | "admin";
  due_at: string;
  created_at: string;
  returned_at: string | null;
  returned_by: string | null;
};
type Stats = { open: number; overdue: number; returnedThisWeek: number };
type View = "open" | "returned" | "all";

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The Circulation tab: every open checkout (overdue first), returns, the
 * running counts, and the checkout-email setting. Soft rules surface here
 * as flags — overdue in red, students over the limit, titles with more
 * copies out than the catalog says the library owns.
 */
export default function CirculationPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [migration, setMigration] = useState(false);
  const [view, setView] = useState<View>("open");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<EmailMode>(DEFAULT_EMAIL_MODE);
  const [savingMode, setSavingMode] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(v: View = view, query: string = q) {
    const params = new URLSearchParams({ view: v });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(withBase(`/api/admin/circulation?${params}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setRows(data.checkouts ?? []);
    setCopies(data.copies ?? {});
    setStats(data.stats ?? null);
    setMigration(data.migrationPending === true);
  }

  useEffect(() => {
    load();
    fetch(withBase("/api/admin/circulation/settings"))
      .then((r) => r.json())
      .then((d) => {
        if (d.emailMode) setEmailMode(d.emailMode);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(next: string) {
    setQ(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(view, next), 300);
  }

  function switchView(v: View) {
    setView(v);
    load(v);
  }

  function say(text: string, isError = false) {
    setNote(text);
    announce(text, isError);
    setTimeout(() => setNote((cur) => (cur === text ? null : cur)), 3200);
  }

  async function act(row: Row, action: "return" | "reopen") {
    setBusy(row.id);
    try {
      const res = await fetch(withBase(`/api/admin/circulation/${row.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return say(data.error ?? "Couldn't update that checkout.", true);
      say(action === "return" ? `Marked “${row.title}” returned.` : `Reopened “${row.title}”.`);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function saveMode(mode: EmailMode) {
    const prev = emailMode;
    setEmailMode(mode);
    setSavingMode(true);
    try {
      const res = await fetch(withBase("/api/admin/circulation/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailMode: mode }),
      });
      if (!res.ok) {
        setEmailMode(prev);
        const data = await res.json().catch(() => ({}));
        say(data.error ?? "Couldn't save the email setting.", true);
      } else {
        say("Email setting saved.");
      }
    } finally {
      setSavingMode(false);
    }
  }

  // Soft-rule flags, computed over the loaded rows.
  const openRows = (rows ?? []).filter((r) => !r.returned_at);
  const openPerBook: Record<string, number> = {};
  const openPerStudent: Record<string, number> = {};
  for (const r of openRows) {
    openPerBook[r.book_key] = (openPerBook[r.book_key] ?? 0) + 1;
    openPerStudent[r.student_email] = (openPerStudent[r.student_email] ?? 0) + 1;
  }

  if (migration) {
    return <div className="notice">Circulation unlocks after migration <code>0026_circulation.sql</code> runs in Supabase.</div>;
  }

  return (
    <>
      {/* The desk: scan/type → student → check out/in. Same component the
          staff Checkout Desk tab renders; the table below is the status
          view here, so the desk's own list is off. */}
      <CirculationDesk showStatus={false} onChange={() => load()} />

      {stats && (
        <div className="cards" style={{ marginBottom: 16 }}>
          <div className="card">
            <h2 style={{ margin: 0 }}>{stats.open}</h2>
            <p className="hint" style={{ margin: 0 }}>books out right now</p>
          </div>
          <div className="card">
            <h2 style={{ margin: 0, color: stats.overdue > 0 ? "#8f1b23" : undefined }}>{stats.overdue}</h2>
            <p className="hint" style={{ margin: 0 }}>overdue (out more than 2 weeks)</p>
          </div>
          <div className="card">
            <h2 style={{ margin: 0 }}>{stats.returnedThisWeek}</h2>
            <p className="hint" style={{ margin: 0 }}>returned in the last 7 days</p>
          </div>
        </div>
      )}

      {note && (
        <div className="notice" role="status" aria-live="polite">
          {note}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <div role="group" aria-label="Which checkouts to show" style={{ display: "flex", gap: 6 }}>
            {(["open", "returned", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`btn${view === v ? " brand" : ""}`}
                aria-pressed={view === v}
                onClick={() => switchView(v)}
              >
                {v === "open" ? "Out now" : v === "returned" ? "Returned" : "Everything"}
              </button>
            ))}
          </div>
          <input
            className="input"
            type="search"
            style={{ flex: "1 1 220px", minWidth: 180 }}
            aria-label="Filter by student or book title"
            placeholder="Filter by student or title…"
            value={q}
            onChange={(e) => search(e.target.value)}
          />
        </div>

        {rows === null ? (
          <p className="hint" style={{ margin: 0 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            {view === "open" ? "No books are out right now." : "Nothing here yet."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Taken</th>
                  <th>Due</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const returned = !!r.returned_at;
                  const overdue = !returned && isOverdue(r.due_at);
                  const owned = copies[r.book_key];
                  const overChecked = !returned && owned !== undefined && (openPerBook[r.book_key] ?? 0) > owned;
                  const overLimit = !returned && (openPerStudent[r.student_email] ?? 0) > SOFT_LIMIT;
                  const byOther = r.checked_out_by !== r.student_email;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{displayNameFull(r.student_email)}</span>
                        <span className="hint" style={{ display: "block", margin: 0 }}>{r.student_email}</span>
                      </td>
                      <td>
                        {r.title}
                        {byOther && (
                          <span className="hint" style={{ display: "block", margin: 0 }}>
                            by {displayNameFull(r.checked_out_by)} ({r.checked_out_via})
                          </span>
                        )}
                      </td>
                      <td title={new Date(r.created_at).toLocaleString()}>
                        {shortDay(r.created_at)}
                        <span className="hint" style={{ display: "block", margin: 0 }}>{outLabel(r.created_at)}</span>
                      </td>
                      <td>
                        {returned ? (
                          <span className="pill" style={{ background: "#e7f6f3", color: "#175f55" }}>
                            Returned {shortDay(r.returned_at!)}
                          </span>
                        ) : (
                          <span
                            className="pill"
                            style={overdue ? { background: "#fdecec", color: "#8f1b23" } : { background: "#eef0f5" }}
                          >
                            {dueLabel(r.due_at)}
                          </span>
                        )}
                      </td>
                      <td>
                        {overChecked && (
                          <span className="pill" style={{ background: "#fff3e0", color: "#8a5300" }}>
                            {openPerBook[r.book_key]} out of {owned} owned
                          </span>
                        )}{" "}
                        {overLimit && (
                          <span className="pill" style={{ background: "#fff3e0", color: "#8a5300" }}>
                            {openPerStudent[r.student_email]} books out
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {returned ? (
                          <button type="button" className="btn ghost" disabled={busy === r.id} onClick={() => act(r, "reopen")}>
                            Reopen
                          </button>
                        ) : (
                          <button type="button" className="btn" disabled={busy === r.id} onClick={() => act(r, "return")}>
                            Mark returned
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Checkout emails</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          How the library mailbox hears about checkouts. The daily summary goes out with the morning
          housekeeping run and covers the previous day.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {EMAIL_MODES.map((mode) => (
            <label key={mode} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="radio"
                name="circ-email-mode"
                checked={emailMode === mode}
                disabled={savingMode}
                onChange={() => saveMode(mode)}
              />
              {EMAIL_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
