"use client";

import { useState } from "react";
import { withBase } from "@/lib/base";

/**
 * Claims a one-time link. Two modes, one endpoint (/api/invite/claim decides
 * by the token's kind on the server):
 *  - "invite" (default): full sign-up form, creates a new admin account
 *  - "reset": just a new password for the EXISTING admin the link targets
 */
export default function InviteClaimForm({
  token,
  mode = "invite",
}: {
  token: string;
  mode?: "invite" | "reset";
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = mode === "reset";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase("/api/invite/claim"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { token, password } : { token, name, email, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      window.location.href = withBase("/admin");
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      {!reset && (
        <>
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
        </>
      )}
      <div className="field">
        <label className="lbl" htmlFor="password">{reset ? "New password" : "Password"}</label>
        <input id="password" className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="hint">At least 10 characters.</p>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="confirm">{reset ? "Confirm new password" : "Confirm password"}</label>
        <input id="confirm" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy
          ? reset
            ? "Setting password…"
            : "Creating account…"
          : reset
            ? "Set new password"
            : "Create management account"}
      </button>
    </form>
  );
}
