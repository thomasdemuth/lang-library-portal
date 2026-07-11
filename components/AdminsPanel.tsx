"use client";

import { Fragment, useEffect, useState } from "react";
import { PERMISSIONS, type PermKey } from "@/lib/permissions";

type Admin = {
  id: string;
  username: string;
  email: string;
  name: string;
  created_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
  role: "chief" | "admin";
  permissions: Record<string, boolean> | null;
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

const EMPTY_PERMS: Record<string, boolean> = {};

export default function AdminsPanel({ selfId }: { selfId: string }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "chief">("admin");
  const [invitePerms, setInvitePerms] = useState<Record<string, boolean>>(EMPTY_PERMS);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openPowers, setOpenPowers] = useState<string | null>(null);

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
        body: JSON.stringify({
          label: label || undefined,
          role: inviteRole,
          permissions: inviteRole === "admin" ? invitePerms : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the invite.");
        return;
      }
      setNewLink(data.url);
      setLabel("");
      setInvitePerms(EMPTY_PERMS);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    load();
  }

  async function patchAdmin(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/admins/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error ?? "Couldn't update that admin.");
    load();
  }

  function togglePerm(a: Admin, key: PermKey) {
    const current = a.permissions ?? {};
    const next = { ...current, [key]: !current[key] };
    // optimistic
    setAdmins((cur) => cur.map((x) => (x.id === a.id ? { ...x, permissions: next } : x)));
    patchAdmin(a.id, { permissions: next });
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
          Creates a private single-use link. Share it directly — they pick their own email and
          password. Links expire after 7 days.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Label (e.g. “For Ms. Okafor”)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
          />
          <select
            className="input"
            style={{ width: "auto" }}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "chief")}
          >
            <option value="admin">Admin</option>
            <option value="chief">Chief Admin</option>
          </select>
        </div>

        {inviteRole === "admin" ? (
          <div style={{ marginTop: 14 }}>
            <span className="lbl">Starting powers</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 6 }}>
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="check" title={p.desc}>
                  <input
                    type="checkbox"
                    checked={!!invitePerms[p.key]}
                    onChange={(e) => setInvitePerms((cur) => ({ ...cur, [p.key]: e.target.checked }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 12 }}>
            Chief Admins have every power, plus managing admins, invites, and deletions.
          </p>
        )}

        <div style={{ marginTop: 14 }}>
          <button className="btn brand" onClick={createInvite} disabled={busy}>
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
              <th>Email</th>
              <th>Role</th>
              <th>Powers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const perms = a.permissions ?? {};
              const grantedCount = PERMISSIONS.filter((p) => perms[p.key]).length;
              return (
                <Fragment key={a.id}>
                  <tr style={a.disabled_at ? { opacity: 0.55 } : undefined}>
                    <td>
                      <b>{a.name}</b>
                      {a.id === selfId && (
                        <span className="pill" style={{ background: "#eef1fb", marginLeft: 8 }}>you</span>
                      )}
                      {a.disabled_at && (
                        <span className="pill" style={{ background: "#fdecec", marginLeft: 8 }}>disabled</span>
                      )}
                      <div className="hint" style={{ marginTop: 2 }}>{a.username}</div>
                    </td>
                    <td>{a.email}</td>
                    <td>
                      <select
                        className="input"
                        style={{ width: "auto", padding: "6px 8px" }}
                        value={a.role}
                        onChange={(e) => patchAdmin(a.id, { role: e.target.value })}
                      >
                        <option value="admin">Admin</option>
                        <option value="chief">Chief Admin</option>
                      </select>
                    </td>
                    <td>
                      {a.role === "chief" ? (
                        <span className="hint">All powers</span>
                      ) : (
                        <button
                          className="btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => setOpenPowers(openPowers === a.id ? null : a.id)}
                        >
                          {grantedCount} of {PERMISSIONS.length} · {openPowers === a.id ? "Hide" : "Edit"}
                        </button>
                      )}
                    </td>
                    <td>
                      {a.id !== selfId && (
                        <button className="btn ghost" onClick={() => patchAdmin(a.id, { disabled: !a.disabled_at })}>
                          {a.disabled_at ? "Re-enable" : "Disable"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {a.role === "admin" && openPowers === a.id && (
                    <tr>
                      <td colSpan={5} style={{ background: "var(--bg)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 6, padding: "4px 2px" }}>
                          {PERMISSIONS.map((p) => (
                            <label key={p.key} className="check" title={p.desc}>
                              <input type="checkbox" checked={!!perms[p.key]} onChange={() => togglePerm(a, p.key)} />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
                            state === "active" ? "#e7f6f3" : state === "used" ? "#eef1fb" : "#f3f4f7",
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
