"use client";

import { useEffect, useState } from "react";
import { safeNextPath } from "@/lib/safe-next";
import { withBase } from "@/lib/base";

/**
 * Sign-in options on the unified host:
 *   • "Sign in with Google" — top-level navigation to /api/auth/google/start
 *     (server-side OAuth redirect flow; no client JS, so the CSP is untouched).
 *   • "Continue as a guest" — a restricted lookup+map-only session.
 * Management sign-in lives on the separate /admin/login page. (The passwordless
 * email break-glass still lives on the per-host /gate pages, not here.)
 */

const ERROR_TEXT: Record<string, string> = {
  domain:
    "That's not a school Google account. Use your @thelangschool.org (staff) or @students.thelangschool.org (student) account — or continue as a guest.",
  google_denied: "Google sign-in was cancelled. Please try again.",
  google_state: "Your sign-in link expired. Please try again.",
  google: "Google sign-in didn't complete. Please try again.",
  google_unconfigured: "Google sign-in isn't set up yet — ask the library team.",
};

const BOX: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  textDecoration: "none",
  borderRadius: 12,
  padding: "16px 18px",
  fontWeight: 700,
  fontSize: 16,
  boxSizing: "border-box",
};

export default function SignInForm({ google }: { google: boolean }) {
  const [nextQS, setNextQS] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get("next"), "");
    setNextQS(next ? `?next=${encodeURIComponent(next)}` : "");
    const err = params.get("error");
    if (err) setError(ERROR_TEXT[err] ?? "Something went wrong — please try again.");
  }, []);

  // v8 (calm): the Google button is the one action; guest access is a quiet
  // text link, not a competing button. The two links sit in their own group
  // below a hairline so the button has room. Auth hrefs and params are
  // untouched — presentation only.
  return (
    <>
      {error && <div className="error">{error}</div>}

      {google && (
        <a className="btn brand" href={withBase(`/api/auth/google/start${nextQS}`)} style={BOX}>
          <GoogleG /> Sign in with Google
        </a>
      )}

      {/* The hairline only makes sense under a primary button. */}
      <div className={google ? "signin-links" : undefined}>
        <p className="signin-guestrow">
          <a className="signin-guest" href={withBase("/api/auth/guest")}>
            Browse as a guest
          </a>
        </p>

        <p className="signin-alt">
          <a href={withBase("/admin/login")}>Library management sign-in</a>
        </p>
      </div>
    </>
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
