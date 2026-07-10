"use client";

import { useEffect, useState } from "react";

type Admin = {
  id: string;
  username: string;
  email: string;
  name: string;
  created_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
};
type Invite = {
  id: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

function inviteState(i: Invite): string {
  if (i.used_at) return "used";
  if (i.revoked_at) return "revoked";
  if (new Date(i.expires_at) < new Date()) return "expired";
  return "active";
}

export default function AdminsPanel({ selfId }: { selfId: string }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [a, i] = await Promise.all([
      fetch("/api/admin/admins").then((r) => r.json()),
      fetch("/api/admin/invites").then((r) => r.json()),
    ]);
    if (a.admins) setAdmins(a.admins);
    if (i.invites) setInvites(i.invites);
  }
  useEffect(() => {
    load();
  }, []);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setNewLink(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the invite.");
        return;
      }
      setNewLink(data.url);
      setLabel("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    load();
  }

  async function setDisabled(id: string, disabled: boolean) {
    const res = await fetch(`/api/admin/admins/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled }),
    });
    if (!res.ok) setError((await res.json()).error ?? "Couldn't update that admin.");
    load();
  }

  async function copy() {
    if (!newLink) return;
    await navigator.clipboard.writeText(newLink);
    setCopied(true);
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Invite a new admin</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Creates a private single-use link. Share it directly with the new admin — they&rsquo;ll
          pick their own email and password. Links expire after 7 days.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Label (e.g. “For Ms. Okafor”)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
          />
          <button className="btn primary" onClick={createInvite} disabled={busy}>
            {busy ? "Creating…" : "Create invite link"}
          </button>
        </div>
        {newLink && (
          <div style={{ marginTop: 14 }}>
            <div className="notice">
              This link is shown <b>once</b> — copy it now.
            </div>
            <div className="copybox">
              <span style={{ flex: 1 }}>{newLink}</span>
              <button className="btn" onClick={copy}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Admins</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Last sign-in</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} style={a.disabled_at ? { opacity: 0.5 } : undefined}>
                <td>
                  {a.name}
                  {a.id === selfId && (
                    <span className="pill" style={{ background: "#eef", marginLeft: 8 }}>you</span>
                  )}
                  {a.disabled_at && (
                    <span className="pill" style={{ background: "#fdecec", marginLeft: 8 }}>disabled</span>
                  )}
                </td>
                <td>{a.username}</td>
                <td>{a.email}</td>
                <td>{a.last_login_at ? new Date(a.last_login_at).toLocaleDateString() : "never"}</td>
                <td>
                  {a.id !== selfId && (
                    <button className="btn ghost" onClick={() => setDisabled(a.id, !a.disabled_at)}>
                      {a.disabled_at ? "Re-enable" : "Disable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invite links</h2>
        {invites.length === 0 ? (
          <p className="hint">No invites yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const state = inviteState(i);
                return (
                  <tr key={i.id}>
                    <td>{i.label ?? "—"}</td>
                    <td>{new Date(i.created_at).toLocaleDateString()}</td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          background:
                            state === "active" ? "#e7f6f3" : state === "used" ? "#eef" : "#f3f4f7",
                        }}
                      >
                        {state}
                      </span>
                    </td>
                    <td>
                      {state === "active" && (
                        <button className="btn ghost" onClick={() => revoke(i.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
