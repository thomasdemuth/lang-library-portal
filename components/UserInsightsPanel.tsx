"use client";

import { useCallback, useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import { DEFAULT_AVATAR, displayNameFull, type Avatar } from "@/lib/play";
import { STATUS_LABELS } from "@/lib/labels";
import { Heart, Ic, Star } from "@/components/icons";

type Tab = "students" | "teachers";

type ListRow = {
  email: string;
  lastSeen: string | null;
  notes: number;
  points?: number;
  booksRead?: number;
  favorites?: number;
  hidden?: boolean;
  publicId?: string | null;
  requests?: number;
  lastRequest?: string | null;
};

type Detail = {
  profile: { avatar: Avatar; points: number; public_id?: string; hidden?: boolean; created_at: string } | null;
  reads: { id: number; title: string; created_at: string }[];
  favorites: { book_key: string; title: string; created_at: string }[];
  requests: { id: number; title: string; author: string | null; copies_requested: number; status: string; created_at: string }[];
  notes: { id: number; author: string; body: string; created_at: string }[];
  activity: { path: string; audience: string; ts: string }[];
  series: { day: string; count: number }[];
  activityPending: boolean;
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Interactions over time: a small SVG bar chart, one bar per day. */
function ActivityChart({ series }: { series: { day: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const W = 600;
  const H = 90;
  const bw = W / series.length;
  return (
    <svg className="uchart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Interactions over time">
      {series.map((s, i) => {
        const h = Math.max(s.count > 0 ? 3 : 1, (s.count / max) * H);
        return (
          <g key={s.day}>
            <rect
              x={i * bw + 2}
              y={H - h}
              width={bw - 4}
              height={h}
              rx={2.5}
              className={s.count > 0 ? "ubar on" : "ubar"}
            >
              <title>{`${s.day}: ${s.count}`}</title>
            </rect>
            {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
              <text x={i * bw + bw / 2} y={H + 13} textAnchor="middle" className="uchart-lbl">
                {shortDate(s.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * User Insights: every student and teacher account, their activity, and
 * internal notes. Students expand into profile moderation + reading data;
 * teachers into their book requests.
 */
export default function UserInsightsPanel({ studentBase }: { studentBase: string }) {
  const [tab, setTab] = useState<Tab>("students");
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [migration, setMigration] = useState(false);
  const [query, setQuery] = useState("");
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [starDraft, setStarDraft] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback((t: Tab) => {
    setLoaded(false);
    fetch(`/api/admin/users?tab=${t}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.users ?? []);
        setMigration(Boolean(d.migrationPending));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadList(tab);
    setOpenEmail(null);
    setDetail(null);
  }, [tab, loadList]);

  function openDetail(email: string) {
    if (openEmail === email) {
      setOpenEmail(null);
      setDetail(null);
      return;
    }
    setOpenEmail(email);
    setDetail(null);
    setNoteDraft("");
    setStarDraft("");
    fetch(`/api/admin/users/detail?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => {});
  }

  function say(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3200);
  }

  async function moderate(email: string, action: "hide" | "unhide" | "reset_avatar") {
    const res = await fetch("/api/admin/users/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return say(false, data.error ?? "Couldn't do that.");
    say(true, action === "reset_avatar" ? "Avatar reset to the default." : action === "hide" ? "Profile hidden." : "Profile visible again.");
    loadList(tab);
    if (detail?.profile) {
      setDetail({
        ...detail,
        profile:
          action === "reset_avatar"
            ? { ...detail.profile, avatar: DEFAULT_AVATAR }
            : { ...detail.profile, hidden: action === "hide" },
      });
    }
  }

  async function giveStars(email: string, delta: number) {
    if (!Number.isInteger(delta) || delta === 0) return say(false, "Enter a whole number of stars (like 25 or -10).");
    const res = await fetch("/api/admin/users/stars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, delta }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return say(false, data.error ?? "Couldn't adjust stars.");
    setStarDraft("");
    say(true, delta > 0 ? `Gave ${delta} stars.` : `Removed ${-delta} stars.`);
    setRows((cur) => cur.map((r) => (r.email === email ? { ...r, points: data.points, notes: data.note ? r.notes + 1 : r.notes } : r)));
    if (detail?.profile) {
      setDetail({
        ...detail,
        profile: { ...detail.profile, points: data.points },
        notes: data.note ? [data.note, ...detail.notes] : detail.notes,
      });
    }
  }

  async function addNote(email: string) {
    const body = noteDraft.trim();
    if (!body) return;
    const res = await fetch("/api/admin/users/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return say(false, data.error ?? "Couldn't save the note.");
    setNoteDraft("");
    if (detail) setDetail({ ...detail, notes: [data.note, ...detail.notes] });
    setRows((cur) => cur.map((r) => (r.email === email ? { ...r, notes: r.notes + 1 } : r)));
  }

  async function deleteNote(email: string, id: number) {
    const res = await fetch(`/api/admin/users/notes?id=${id}`, { method: "DELETE" });
    if (!res.ok) return say(false, "Couldn't delete the note.");
    if (detail) setDetail({ ...detail, notes: detail.notes.filter((n) => n.id !== id) });
    setRows((cur) => cur.map((r) => (r.email === email ? { ...r, notes: Math.max(0, r.notes - 1) } : r)));
  }

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => !q || r.email.toLowerCase().includes(q) || displayNameFull(r.email).toLowerCase().includes(q)
  );

  return (
    <>
      <div className="utabs">
        <button type="button" className={`utab${tab === "students" ? " on" : ""}`} onClick={() => setTab("students")}>
          <Ic name="backpack" size={15} /> Students
        </button>
        <button type="button" className={`utab${tab === "teachers" ? " on" : ""}`} onClick={() => setTab("teachers")}>
          <Ic name="apple" size={15} /> Teachers
        </button>
        <input
          className="input usearch"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      {migration && (
        <div className="notice">
          Student accounts appear after migrations 0012–0013 run in the Supabase SQL editor.
        </div>
      )}

      {!loaded ? (
        <p className="hint">Loading accounts…</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            {q ? "No accounts match that search." : "No accounts seen yet."}
          </p>
        </div>
      ) : (
        <div className="ulist">
          {visible.map((r) => (
            <div key={r.email} className={`card urow-card${openEmail === r.email ? " open" : ""}`}>
              <button type="button" className="urow" onClick={() => openDetail(r.email)}>
                <span className="urow-name">
                  <b>{displayNameFull(r.email)}</b>
                  <span className="hint" style={{ margin: 0 }}>{r.email}</span>
                </span>
                <span className="urow-stats">
                  {tab === "students" ? (
                    <>
                      <span title="Books logged"><Ic name="book" size={13} /> {r.booksRead}</span>
                      <span title="Favorites"><Heart filled size={13} /> {r.favorites}</span>
                      <span title="Stars"><Star size={13} /> {r.points}</span>
                      {r.hidden && <span className="upill">hidden</span>}
                    </>
                  ) : (
                    <span title="Book requests"><Ic name="requests" size={13} /> {r.requests} request{r.requests === 1 ? "" : "s"}</span>
                  )}
                  {r.notes > 0 && <span className="upill note"><Ic name="note" size={11} /> {r.notes}</span>}
                  <span className="urow-seen">{ago(r.lastSeen ?? r.lastRequest ?? null)}</span>
                </span>
              </button>

              {openEmail === r.email && (
                <div className="udetail">
                  {!detail ? (
                    <p className="hint">Loading…</p>
                  ) : (
                    <>
                      {tab === "students" && (
                        <div className="udetail-head">
                          <AvatarView avatar={{ ...DEFAULT_AVATAR, ...(detail.profile?.avatar ?? {}) }} size={64} />
                          <div className="udetail-actions">
                            {detail.profile?.public_id && (
                              <a
                                className="btn ghost"
                                href={`${studentBase}/students/${detail.profile.public_id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open profile page ↗
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => moderate(r.email, detail.profile?.hidden ? "unhide" : "hide")}
                            >
                              {detail.profile?.hidden ? "Show profile" : "Hide profile"}
                            </button>
                            <button type="button" className="btn ghost" onClick={() => moderate(r.email, "reset_avatar")}>
                              Reset avatar
                            </button>
                          </div>
                        </div>
                      )}

                      {tab === "students" && detail.profile && (
                        <div className="stargrant">
                          <span className="stargrant-now">
                            <Star size={14} /> <b>{detail.profile.points}</b> stars
                          </span>
                          {[5, 10, 25].map((n) => (
                            <button key={n} type="button" className="btn ghost" onClick={() => giveStars(r.email, n)}>
                              +{n}
                            </button>
                          ))}
                          <input
                            className="input stargrant-input"
                            type="number"
                            placeholder="± custom"
                            value={starDraft}
                            onChange={(e) => setStarDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && giveStars(r.email, Number(starDraft))}
                          />
                          <button
                            type="button"
                            className="btn"
                            disabled={!starDraft.trim()}
                            onClick={() => giveStars(r.email, Number(starDraft))}
                          >
                            Give stars
                          </button>
                        </div>
                      )}

                      <h3 className="usec"><Ic name="chart" size={14} /> Interactions — last 30 days</h3>
                      {detail.activityPending && detail.series.every((s) => s.count === 0) ? (
                        <p className="hint">
                          Activity appears here once migration 0013 runs (page views start being linked to accounts).
                        </p>
                      ) : (
                        <ActivityChart series={detail.series} />
                      )}

                      {tab === "teachers" && (
                        <>
                          <h3 className="usec"><Ic name="requests" size={14} /> Book requests</h3>
                          {detail.requests.length === 0 ? (
                            <p className="hint">No book requests yet.</p>
                          ) : (
                            <div className="uitems">
                              {detail.requests.map((b) => (
                                <div key={b.id} className="uitem">
                                  <b style={{ flex: 1 }}>
                                    {b.title}
                                    {b.author ? <span className="hint" style={{ margin: 0 }}> — {b.author}</span> : null}
                                  </b>
                                  <span className={`upill status-${b.status}`}>{STATUS_LABELS[b.status] ?? b.status}</span>
                                  <span className="urow-seen">{shortDate(b.created_at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {tab === "students" && (
                        <div className="ucols">
                          <div>
                            <h3 className="usec"><Ic name="book" size={14} /> Books read ({detail.reads.length})</h3>
                            {detail.reads.length === 0 ? (
                              <p className="hint">Nothing logged yet.</p>
                            ) : (
                              <div className="uitems">
                                {detail.reads.slice(0, 12).map((b) => (
                                  <div key={b.id} className="uitem">
                                    <b style={{ flex: 1 }}>{b.title}</b>
                                    <span className="urow-seen">{shortDate(b.created_at)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <h3 className="usec"><Heart filled size={14} /> Favorites ({detail.favorites.length})</h3>
                            {detail.favorites.length === 0 ? (
                              <p className="hint">No favorites yet.</p>
                            ) : (
                              <div className="uitems">
                                {detail.favorites.slice(0, 12).map((b) => (
                                  <div key={b.book_key} className="uitem">
                                    <b style={{ flex: 1 }}>{b.title}</b>
                                    <span className="urow-seen">{shortDate(b.created_at)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <h3 className="usec"><Ic name="clock" size={14} /> Recent activity</h3>
                      {detail.activity.length === 0 ? (
                        <p className="hint">No page views recorded for this account yet.</p>
                      ) : (
                        <div className="uitems ulog">
                          {detail.activity.slice(0, 14).map((a, i) => (
                            <div key={i} className="uitem">
                              <code>{a.path}</code>
                              <span className="urow-seen">{ago(a.ts)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <h3 className="usec"><Ic name="note" size={14} /> Internal notes</h3>
                      <div className="unote-add">
                        <input
                          className="input"
                          placeholder="Add a note only admins can see…"
                          value={noteDraft}
                          maxLength={2000}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addNote(r.email)}
                        />
                        <button type="button" className="btn" onClick={() => addNote(r.email)} disabled={!noteDraft.trim()}>
                          Add note
                        </button>
                      </div>
                      {detail.notes.length > 0 && (
                        <div className="uitems">
                          {detail.notes.map((n) => (
                            <div key={n.id} className="uitem unote">
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: 0 }}>{n.body}</p>
                                <span className="hint" style={{ margin: 0 }}>
                                  {n.author} · {shortDate(n.created_at)}
                                </span>
                              </div>
                              <button type="button" className="linklike" onClick={() => deleteNote(r.email, n.id)}>
                                delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
