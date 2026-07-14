"use client";

import { useEffect, useState } from "react";

type Update = { id: number; title: string; body: string; created_at: string };

export default function UpdatesPanel({ canPublish }: { canPublish: boolean }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/updates");
    const data = await res.json();
    if (res.ok) {
      setUpdates(data.updates ?? []);
      setMigrationPending(Boolean(data.migrationPending));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, override }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Couldn't publish the update." });
        return;
      }
      setMsg({
        ok: true,
        text: `Published — notified ${data.push.sent} of ${data.push.devices} registered device${data.push.devices === 1 ? "" : "s"}.`,
      });
      setTitle("");
      setBody("");
      setOverride(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {migrationPending && (
        <div className="error">Updates need database migration 0009 — run it in Supabase first.</div>
      )}
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}

      {canPublish && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>Publish an update</h2>
          <form onSubmit={publish} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              className="input"
              placeholder="Title (e.g. “New: scan-to-shelve mode”)"
              value={title}
              maxLength={120}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="What changed?"
              value={body}
              maxLength={2000}
              required
              onChange={(e) => setBody(e.target.value)}
            />
            <label className="check">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Also notify admins who opted out of announcements
            </label>
            <button className="btn brand" disabled={busy} style={{ alignSelf: "flex-start" }}>
              {busy ? "Publishing…" : "📣 Publish & notify"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What's new</h2>
        {updates.length === 0 ? (
          <p className="hint">No updates posted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {updates.map((u) => (
              <div key={u.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 15 }}>{u.title}</b>
                  <span className="hint" style={{ margin: 0 }}>
                    {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{u.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
