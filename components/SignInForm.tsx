"use client";

import { useEffect, useRef, useState } from "react";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Universal sign-in (unified host). Two-phase against /api/gate:
 *   1. email only → students and teachers get a session straight away;
 *      registered management accounts get { requiresPassword: true }
 *   2. email + password → admin session
 * The password field appears inline (no reload) only when the server says
 * this email is a registered management account. Editing the email hides
 * it again. A ?next= deep link wins over the server's role-home redirect.
 */
export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  // Handed off from an old gate link (?email=…&auto=1): prefill, submit once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("email");
    if (!preset) return;
    setEmail(preset);
    if (params.get("auto") === "1" && !autoRan.current) {
      autoRan.current = true;
      void submitGate(preset, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (needsPassword) passwordRef.current?.focus();
  }, [needsPassword]);

  async function submitGate(emailValue: string, passwordValue: string | undefined) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          passwordValue ? { email: emailValue, password: passwordValue } : { email: emailValue }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (data.requiresPassword) setNeedsPassword(true);
      if (!res.ok) {
        setError(data.error ?? "Something went wrong — try again.");
        return;
      }
      if (data.requiresPassword && !passwordValue) return; // field just appeared — wait for input
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = safeNextPath(next, data.redirect ?? "/");
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await submitGate(email, needsPassword ? password : undefined);
  }

  function onEmailChange(value: string) {
    setEmail(value);
    // A different email might not be a management account — start over.
    if (needsPassword) {
      setNeedsPassword(false);
      setPassword("");
      setError(null);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error">{error}</div>}
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
          placeholder="you@thelangschool.org"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>
      {needsPassword && (
        <div className="field">
          <label className="lbl" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            ref={passwordRef}
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="hint" style={{ marginTop: 6 }}>
            This email has a library management account — enter its password.
          </p>
        </div>
      )}
      <button className="btn brand" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Checking…" : needsPassword ? "Sign in" : "Continue"}
      </button>
    </form>
  );
}
