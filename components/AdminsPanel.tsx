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

/** Split a display name into first + last (last = everything after the first word). */
function splitName(full: string): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "—", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * One-time link with a copy button. Clipboard access can be denied silently
 * (permissions, non-secure context) — a failure switches to a selectable
 * input so the link is never lost.
 */
export function CopyOnceBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <>
      <div className="copybox">
        <span style={{ flex: 1, wordBreak: "break-all" }}>{url}</span>
        <button className="btn" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {failed && (
        <div style={{ marginTop: 8 }}>
          <p className="hint" style={{ margin: "0 0 4px" }}>
            Copy didn&rsquo;t work — select and copy:
          </p>
          <input
            className="input"
            readOnly
            value={url}
            aria-label="Link to copy manually"
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </>
  );
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
  const [openPowers, setOpenPowers] = useState<string | null>(null);
  // Two-step confirms for the destructive actions
  const [pendingRole, setPendingRole] = useState<{ id: string; role: "chief" | "admin" } | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  // One-time links minted from this screen
  const [resetLink, setResetLink] = useState<{ id: string; name: string; url: string } | null>(null);
  const [regenLink, setRegenLink] = useState<{ id: string; label: string; url: string } | null>(null);

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
    setError(null);
    setConfirmRevoke(null);
    try {
      const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't revoke that invite — try again.");
      }
    } catch {
      setError("Couldn't reach the server — that invite wasn't revoked.");
    }
    load();
  }

  async function regenerate(invite: Invite) {
    setError(null);
    setRegenLink(null);
    try {
      const res = await fetch(`/api/admin/invites/${invite.id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't regenerate that invite.");
        return;
      }
      setRegenLink({ id: invite.id, label: invite.label ?? "this invite", url: data.url });
    } catch {
      setError("Couldn't reach the server — try again.");
    }
    load();
  }

  async function resetPassword(a: Admin) {
    setError(null);
    setResetLink(null);
    try {
      const res = await fetch(`/api/admin/admins/${a.id}/reset`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the reset link.");
        return;
      }
      setResetLink({ id: a.id, name: splitName(a.name).first, url: data.url });
    } catch {
      setError("Couldn't reach the server — try again.");
    }
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
              This link is shown <b>once</b> — copy it now. (Lost it? Regenerate it from the
              invite-links table below.)
            </div>
            <CopyOnceBox url={newLink} />
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Admins</h2>
        <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>First Name</th>
              <th>Last Name</th>
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
              const { first, last } = splitName(a.name);
              const roleChange = pendingRole?.id === a.id ? pendingRole : null;
              return (
                <Fragment key={a.id}>
                  <tr style={a.disabled_at ? { opacity: 0.55 } : undefined}>
                    <td data-th="First Name">
                      <b>{first}</b>
                      {a.id === selfId && (
                        <span className="pill" style={{ background: "#eef1fb", marginLeft: 8 }}>you</span>
                      )}
                      {a.disabled_at && (
                        <span className="pill" style={{ background: "#fdecec", marginLeft: 8 }}>disabled</span>
                      )}
                    </td>
                    <td data-th="Last Name"><b>{last || "—"}</b></td>
                    <td>{a.email}</td>
                    <td>
                      <select
                        className="input"
                        style={{ width: "auto", padding: "6px 8px" }}
                        value={roleChange?.role ?? a.role}
                        onChange={(e) => {
                          const role = e.target.value as "chief" | "admin";
                          if (role === a.role) setPendingRole(null);
                          else setPendingRole({ id: a.id, role });
                        }}
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
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {!a.disabled_at && (
                            <button className="btn ghost" onClick={() => resetPassword(a)}>
                              Reset password
                            </button>
                          )}
                          {confirmDisable === a.id ? (
                            <span className="modal-confirm">
                              <span className="hint" style={{ margin: 0 }}>
                                Disable {first}? They&rsquo;re signed out immediately.
                              </span>
                              <button
                                className="btn danger"
                                onClick={() => {
                                  setConfirmDisable(null);
                                  patchAdmin(a.id, { disabled: true });
                                }}
                              >
                                Yes, disable
                              </button>
                              <button className="btn ghost" onClick={() => setConfirmDisable(null)}>
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              className="btn ghost"
                              onClick={() =>
                                a.disabled_at
                                  ? patchAdmin(a.id, { disabled: false })
                                  : setConfirmDisable(a.id)
                              }
                            >
                              {a.disabled_at ? "Re-enable" : "Disable"}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                  {roleChange && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--bg)" }}>
                        <div className="notice warn" role="group" aria-label="Confirm role change" style={{ margin: "4px 0" }}>
                          <p style={{ margin: "0 0 8px" }}>
                            {roleChange.role === "chief" ? (
                              <>
                                Make <b>{a.name}</b> a <b>Chief Admin</b>? Chiefs hold every power,
                                including managing admins, invites, and deletions.
                              </>
                            ) : (
                              <>
                                Change <b>{a.name}</b> to <b>Admin</b>? Chief powers are removed —
                                they keep only the powers you grant below.
                              </>
                            )}
                          </p>
                          <span className="modal-confirm">
                            <button
                              className="btn brand"
                              onClick={() => {
                                setPendingRole(null);
                                patchAdmin(a.id, { role: roleChange.role });
                              }}
                            >
                              Yes, change role
                            </button>
                            <button className="btn ghost" onClick={() => setPendingRole(null)}>
                              Cancel
                            </button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {resetLink?.id === a.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--bg)" }}>
                        <div style={{ padding: "4px 2px" }}>
                          <div className="notice">
                            One-time password-reset link for <b>{resetLink.name}</b> — shown{" "}
                            <b>once</b>. Share it directly; their other sessions end when they set
                            the new password. Expires in 7 days.
                          </div>
                          <CopyOnceBox url={resetLink.url} />
                          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setResetLink(null)}>
                            Done
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {a.role === "admin" && openPowers === a.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--bg)" }}>
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
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invite links</h2>
        {regenLink && (
          <div style={{ marginBottom: 14 }}>
            <div className="notice">
              New link for <b>{regenLink.label}</b> — shown <b>once</b>. The old link no longer
              works. Expires in 7 days.
            </div>
            <CopyOnceBox url={regenLink.url} />
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setRegenLink(null)}>
              Done
            </button>
          </div>
        )}
        {invites.length === 0 ? (
          <p className="hint">No invites yet.</p>
        ) : (
          <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Created</th>
                <th>Expires</th>
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
                    <td>{i.used_at || i.revoked_at ? "—" : new Date(i.expires_at).toLocaleDateString()}</td>
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
                      {(state === "active" || state === "expired") && (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            className="btn ghost"
                            title="Voids the old link and mints a fresh one, shown once"
                            onClick={() => regenerate(i)}
                          >
                            Regenerate link
                          </button>
                          {state === "active" &&
                            (confirmRevoke === i.id ? (
                              <span className="modal-confirm">
                                <span className="hint" style={{ margin: 0 }}>
                                  Revoke this invite? The link stops working immediately.
                                </span>
                                <button className="btn danger" onClick={() => revoke(i.id)}>
                                  Yes, revoke
                                </button>
                                <button className="btn ghost" onClick={() => setConfirmRevoke(null)}>
                                  No
                                </button>
                              </span>
                            ) : (
                              <button className="btn ghost" onClick={() => setConfirmRevoke(i.id)}>
                                Revoke
                              </button>
                            ))}
                        </span>
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
    </>
  );
}
