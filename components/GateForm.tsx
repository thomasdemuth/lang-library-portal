"use client";

import { useState } from "react";

export default function GateForm({ placeholder }: { placeholder: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<{ label: string; url: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong — try again.");
        if (data.hint) setHint(data.hint);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="error">
          {error}
          {hint && (
            <>
              {" "}
              <a href={hint.url}>{hint.label} →</a>
            </>
          )}
        </div>
      )}
      <div className="field">
        <label className="lbl" htmlFor="email">
          School email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          required
          autoComplete="email"
          placeholder={placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className="btn brand" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Checking…" : "Enter the library"}
      </button>
    </form>
  );
}
