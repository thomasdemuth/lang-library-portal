"use client";

import { useState } from "react";

export default function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm("Delete your admin account? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't delete the account.");
        return;
      }
      window.location.href = "/admin/login";
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 16, borderColor: "#f3c6c6" }}>
        <h2 style={{ marginTop: 0 }}>Delete account</h2>
        <p className="hint">Permanently remove your admin account. This can't be undone.</p>
        <button className="btn danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 16, borderColor: "#f3c6c6" }}>
      <h2 style={{ marginTop: 0 }}>Delete account</h2>
      <p className="hint">This can't be undone. Confirm your password to continue.</p>
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label className="lbl">Password</label>
          <input
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn danger" disabled={busy}>
            {busy ? "Deleting…" : "Confirm delete"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
