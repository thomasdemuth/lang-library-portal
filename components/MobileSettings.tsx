"use client";

import { useCallback, useEffect, useState } from "react";
import { PERMISSIONS, type PermKey } from "@/lib/permissions";
import NotificationPrefs from "@/components/NotificationPrefs";
import PasswordForm from "@/components/PasswordForm";
import ProfileForm from "@/components/ProfileForm";
import DeleteAccountForm from "@/components/DeleteAccountForm";

type View =
  | "root"
  | "email"
  | "appearance"
  | "textsize"
  | "launch"
  | "admins"
  | "invite"
  | "password"
  | "name"
  | "delete";

type AdminRow = {
  id: string;
  username: string;
  email: string;
  name: string;
  disabled_at: string | null;
  role: "chief" | "admin";
  permissions: Record<string, boolean> | null;
};

const THEMES = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
] as const;
const SIZES = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
] as const;
const LAUNCHES = [
  ["scan", "Scan"],
  ["inventory", "Inventory"],
  ["map", "Map"],
  ["account", "Settings"],
] as const;

function pref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function Icon({ d, bg }: { d: string; bg: string }) {
  return (
    <span className="sr-icon" style={{ background: bg }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

const I = {
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  size: "M4 18V6m0 0 3 3M4 6 1 9m9 9h11M10 12h8M10 6h5",
  rocket: "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M12 15l-3-3c1-4 4-8 10-9-1 6-5 9-9 10z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  team: "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87",
  plus: "M12 5v14M5 12h14",
  key: "M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3M11.6 11.6A5.5 5.5 0 1 0 14 16l-2.4-4.4z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  chev: "M9 18l6-6-6-6",
};

function Row({
  icon,
  bg,
  label,
  value,
  danger,
  onClick,
  href,
}: {
  icon: string;
  bg: string;
  label: string;
  value?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <Icon d={icon} bg={bg} />
      <span className="sr-label" style={danger ? { color: "var(--danger)" } : undefined}>{label}</span>
      {value && <span className="sr-value">{value}</span>}
      <svg className="sr-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d={I.chev} />
      </svg>
    </>
  );
  return href ? (
    <a className="settings-row" href={href}>{inner}</a>
  ) : (
    <button type="button" className="settings-row" onClick={onClick}>{inner}</button>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? "on" : undefined} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function MobileSettings({
  name,
  username,
  email,
  role,
  canPublish,
  isChief,
  selfId,
  notifyRequests,
  notifyWeekly,
  notifyUpdates,
  canDelete,
}: {
  name: string;
  username: string;
  email: string;
  role: "chief" | "admin";
  canPublish?: boolean;
  isChief: boolean;
  selfId: string;
  notifyRequests: boolean;
  notifyWeekly: boolean | null;
  notifyUpdates?: boolean | null;
  canDelete: boolean;
}) {
  const [view, setView] = useState<View>("root");
  const [theme, setTheme] = useState("light");
  const [size, setSize] = useState("medium");
  const [launch, setLaunch] = useState("inventory");
  useEffect(() => {
    setTheme(pref("ll-theme", "light"));
    setSize(pref("ll-textsize", "medium"));
    setLaunch(pref("ll-launch", "inventory"));
  }, []);

  function applyTheme(t: string) {
    setTheme(t);
    try {
      localStorage.setItem("ll-theme", t);
    } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
  }
  function applySize(s: string) {
    setSize(s);
    try {
      localStorage.setItem("ll-textsize", s);
    } catch {}
    if (s === "medium") delete document.documentElement.dataset.textsize;
    else document.documentElement.dataset.textsize = s;
  }
  function applyLaunch(l: string) {
    setLaunch(l);
    try {
      localStorage.setItem("ll-launch", l);
    } catch {}
  }

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/gate";
    }
  }

  const back = (
    <button type="button" className="subview-back" onClick={() => setView("root")}>
      ‹ Settings
    </button>
  );
  const label = (t: string) => <p className="settings-title" style={{ margin: "0 4px 10px" }}>{t}</p>;

  if (view === "email")
    return (
      <div className="subview">
        {back}
        <NotificationPrefs
          isChief={isChief}
          notifyRequests={notifyRequests}
          notifyWeekly={notifyWeekly}
          notifyUpdates={notifyUpdates}
        />
      </div>
    );

  if (view === "appearance")
    return (
      <div className="subview">
        {back}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Appearance</h2>
          <Seg options={THEMES} value={theme as "light"} onChange={applyTheme} />
          <p className="hint">System follows your phone's light/dark setting.</p>
        </div>
      </div>
    );

  if (view === "textsize")
    return (
      <div className="subview">
        {back}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Text &amp; icon size</h2>
          <Seg options={SIZES} value={size as "medium"} onChange={applySize} />
          <p className="hint">Applies everywhere on this device.</p>
        </div>
      </div>
    );

  if (view === "launch")
    return (
      <div className="subview">
        {back}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Open the app on</h2>
          <Seg options={LAUNCHES} value={launch as "scan"} onChange={applyLaunch} />
          <p className="hint">Where the home-screen app starts on this device.</p>
        </div>
      </div>
    );

  if (view === "admins")
    return (
      <div className="subview">
        {back}
        <ManageAdmins selfId={selfId} />
      </div>
    );

  if (view === "invite")
    return (
      <div className="subview">
        {back}
        <InviteAdmin />
      </div>
    );

  if (view === "name")
    return (
      <div className="subview">
        {back}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Display name</h2>
          <ProfileForm initialName={name} />
        </div>
      </div>
    );

  if (view === "password")
    return (
      <div className="subview">
        {back}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Change password</h2>
          <PasswordForm />
        </div>
      </div>
    );

  if (view === "delete")
    return (
      <div className="subview">
        {back}
        <DeleteAccountForm />
      </div>
    );

  return (
    <>
      <div className="settings-profile">
        <div className="sp-line">
          <span className="sp-name">{name || username}</span>
          <span className="sp-dot">•</span>
          <span className="sp-email">{email}</span>
        </div>
        <span className="pill" style={{ background: role === "chief" ? "#eef1fb" : "#eef0f5", color: "#1c2330", marginTop: 6 }}>
          {role === "chief" ? "Chief Admin" : "Admin"}
        </span>
      </div>

      <div className="settings-group" style={{ marginTop: 4 }}>
        <p className="settings-title">Preferences</p>
        <div className="settings-rows">
          <Row icon={I.mail} bg="var(--brand-blue)" label="Email settings" onClick={() => setView("email")} />
          <Row
            icon={I.moon}
            bg="#5b5bd6"
            label="Appearance"
            value={THEMES.find(([v]) => v === theme)?.[1]}
            onClick={() => setView("appearance")}
          />
          <Row
            icon={I.size}
            bg="var(--brand-green)"
            label="Text & icon size"
            value={SIZES.find(([v]) => v === size)?.[1]}
            onClick={() => setView("textsize")}
          />
          <Row
            icon={I.rocket}
            bg="#0e9488"
            label="Launch screen"
            value={LAUNCHES.find(([v]) => v === launch)?.[1]}
            onClick={() => setView("launch")}
          />
        </div>
      </div>

      {isChief && (
        <div className="settings-group">
          <p className="settings-title">Admins</p>
          <div className="settings-rows">
            <Row icon={I.team} bg="#7c4dbc" label="Manage admins" onClick={() => setView("admins")} />
            <Row icon={I.plus} bg="#c2417f" label="Invite a new admin" onClick={() => setView("invite")} />
          </div>
        </div>
      )}

      {canPublish && (
        <div className="settings-group">
          <p className="settings-title">Developer</p>
          <div className="settings-rows">
            <Row icon={I.bell} bg="var(--brand-blue)" label="Updates" href="/admin/updates" />
          </div>
        </div>
      )}

      <div className="settings-group">
        <p className="settings-title">Account</p>
        <div className="settings-rows">
          <Row icon={I.user} bg="var(--brand-green)" label="Display name" value={name} onClick={() => setView("name")} />
          <Row icon={I.key} bg="#b7791f" label="Change password" onClick={() => setView("password")} />
          <Row icon={I.out} bg="#68727f" label="Sign out" onClick={signOut} />
          {canDelete && (
            <Row icon={I.trash} bg="var(--danger)" label="Delete account" danger onClick={() => setView("delete")} />
          )}
        </div>
      </div>
    </>
  );
}

/* ── Manage admins: the roster as tap-to-expand cards ─────────────────── */

function ManageAdmins({ selfId }: { selfId: string }) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/admins");
    const data = await res.json();
    if (res.ok) setAdmins(data.admins);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/admins/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't update that admin.");
    load();
  }

  return (
    <>
      <p className="settings-title" style={{ margin: "0 4px 10px" }}>Manage admins</p>
      {error && <div className="error">{error}</div>}
      {admins.map((a) => {
        const isOpen = open === a.id;
        const isSelf = a.id === selfId;
        return (
          <div key={a.id} className="madmin" style={a.disabled_at ? { opacity: 0.6 } : undefined}>
            <button
              type="button"
              style={{ all: "unset", display: "block", width: "100%", cursor: "pointer" }}
              onClick={() => setOpen(isOpen ? null : a.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <b style={{ flex: 1, fontSize: 15 }}>
                  {a.name}
                  {isSelf ? " (you)" : ""}
                </b>
                <span className="pill" style={{ background: a.role === "chief" ? "#eef1fb" : "#eef0f5", color: "#1c2330" }}>
                  {a.role === "chief" ? "Chief" : "Admin"}
                </span>
                {a.disabled_at && <span className="pill" style={{ background: "#fdecec", color: "#8f1b23" }}>disabled</span>}
              </div>
              <div className="hint" style={{ marginTop: 2 }}>{a.email}</div>
            </button>
            {isOpen && !isSelf && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <Seg
                  options={[["admin", "Admin"], ["chief", "Chief Admin"]] as const}
                  value={a.role}
                  onChange={(role) => patch(a.id, { role })}
                />
                {a.role === "admin" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    {PERMISSIONS.map((p) => (
                      <label key={p.key} className="check" style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={!!a.permissions?.[p.key]}
                          onChange={() => {
                            const next = { ...(a.permissions ?? {}), [p.key]: !a.permissions?.[p.key as PermKey] };
                            setAdmins((cur) => cur.map((x) => (x.id === a.id ? { ...x, permissions: next } : x)));
                            patch(a.id, { permissions: next });
                          }}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                )}
                <button className="btn" onClick={() => patch(a.id, { disabled: !a.disabled_at })}>
                  {a.disabled_at ? "Re-enable account" : "Disable account"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ── Invite: pick powers, then hand off to the iOS share sheet ─────────── */

function InviteAdmin() {
  const [inviteRole, setInviteRole] = useState<"admin" | "chief">("admin");
  const [label, setLabel] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label || undefined,
          role: inviteRole,
          permissions: inviteRole === "admin" ? perms : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the invite.");
        return;
      }
      setLink(data.url);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Lang Library admin invite", url: link });
        return;
      } catch {
        /* user closed the share sheet — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Invite a new admin</h2>
      {error && <div className="error">{error}</div>}
      {!link ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            placeholder="Label (e.g. “For Ms. Okafor”)"
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Seg
            options={[["admin", "Admin"], ["chief", "Chief Admin"]] as const}
            value={inviteRole}
            onChange={setInviteRole}
          />
          {inviteRole === "admin" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="check" style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={!!perms[p.key]}
                    onChange={(e) => setPerms((cur) => ({ ...cur, [p.key]: e.target.checked }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              Chief Admins have every power, plus managing admins, invites, and deletions.
            </p>
          )}
          <button className="btn brand" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create invite"}
          </button>
          <p className="hint" style={{ margin: 0 }}>
            Single-use link, expires in 7 days. They pick their own email and password.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="notice" style={{ marginBottom: 0 }}>
            Invite created — this link is shown <b>once</b>.
          </div>
          <div className="copybox">
            <span style={{ flex: 1 }}>{link}</span>
          </div>
          <button className="btn brand" onClick={share}>
            {copied ? "Copied ✓" : "Share invite…"}
          </button>
        </div>
      )}
    </div>
  );
}
