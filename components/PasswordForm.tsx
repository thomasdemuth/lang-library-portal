"use client";

import { useState } from "react";

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Couldn't change the password." });
        return;
      }
      setMsg({ ok: true, text: "Password changed. Other signed-in sessions were signed out." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420 }}>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      <div className="field">
        <label className="lbl">Current password</label>
        <input className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label className="lbl">New password</label>
        <input className="input" type="password" required minLength={10} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="hint">At least 10 characters.</p>
      </div>
      <div className="field">
        <label className="lbl">Confirm new password</label>
        <input className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="btn primary" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
