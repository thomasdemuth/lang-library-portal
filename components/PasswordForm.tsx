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
        <label className="lbl" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="pw-new">New password</label>
        <input id="pw-new" className="input" type="password" required minLength={10} autoComplete="new-password" aria-describedby="pw-new-hint" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="hint" id="pw-new-hint">At least 10 characters.</p>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="btn primary" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
