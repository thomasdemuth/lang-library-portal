"use client";

import { useState } from "react";

export default function InviteClaimForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label className="lbl" htmlFor="name">Your name</label>
        <input id="name" className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="email">Preferred email</label>
        <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="hint">Request notifications go here.</p>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="username">Username</label>
        <input id="username" className="input" required pattern="[a-zA-Z0-9._-]{3,40}" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="hint">At least 10 characters.</p>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="confirm">Confirm password</label>
        <input id="confirm" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Creating account…" : "Create management account"}
      </button>
    </form>
  );
}
