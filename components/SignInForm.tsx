"use client";

import { useEffect, useState } from "react";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Sign-in options on the unified host:
 *   • "Sign in with Google" — top-level navigation to /api/auth/google/start
 *     (server-side OAuth redirect flow; no client JS, so the CSP is untouched).
 *   • "Continue as a guest" — a restricted lookup+map-only session.
 *   • A dev-only email form (rendered only when `devLogin`) so the app is
 *     testable locally without Google credentials.
 * Management sign-in lives on the separate /admin/login page.
 */

const ERROR_TEXT: Record<string, string> = {
  domain:
    "That's not a school Google account. Use your @thelangschool.org (staff) or @students.thelangschool.org (student) account — or continue as a guest.",
  google_denied: "Google sign-in was cancelled. Please try again.",
  google_state: "Your sign-in link expired. Please try again.",
  google: "Google sign-in didn't complete. Please try again.",
  google_unconfigured: "Google sign-in isn't set up yet — ask the library team.",
};

const BLOCK: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
};

export default function SignInForm({ google, devLogin }: { google: boolean; devLogin: boolean }) {
  const [nextQS, setNextQS] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get("next"), "");
    setNextQS(next ? `?next=${encodeURIComponent(next)}` : "");
    const err = params.get("error");
    if (err) setError(ERROR_TEXT[err] ?? "Something went wrong — please try again.");
  }, []);

  return (
    <>
      {error && <div className="error">{error}</div>}

      {google && (
        <a className="btn brand" href={`/api/auth/google/start${nextQS}`} style={BLOCK}>
          <GoogleG /> Sign in with Google
        </a>
      )}

      <a className="btn ghost" href="/api/auth/guest" style={{ ...BLOCK, marginTop: 10 }}>
        Continue as a guest
      </a>
      <p className="hint" style={{ textAlign: "center", marginTop: 8 }}>
        Guests can use Find a Book and the Library Map.
      </p>

      {devLogin && <DevEmailForm />}
    </>
  );
}

/** Local-only email login (production disables /api/gate). */
function DevEmailForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Something went wrong — try again.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = safeNextPath(next, data.redirect ?? "/");
    } catch {
      setErr("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 18, borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 14 }}>
      <div className="hint" style={{ marginBottom: 8 }}>Dev sign-in (local testing, no Google):</div>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label className="lbl" htmlFor="devemail">School email</label>
        <input
          id="devemail"
          className="input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@thelangschool.org"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className="btn ghost" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Checking…" : "Continue (dev)"}
      </button>
    </form>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.6l6.3 5.2C41.4 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
