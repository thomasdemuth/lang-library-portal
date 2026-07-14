"use client";

import { useEffect, useRef, useState } from "react";

const POLL_MS = 5 * 60 * 1000;

/**
 * Watches the deployment id and offers a refresh when the site has been
 * updated underneath the open page. Phone: full-screen blurred takeover.
 * Desktop: a quiet card in the bottom-right. "Not now" silences the
 * prompt for that version until the next visit.
 */
export default function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const baseline = useRef<string | null>(null);
  const offered = useRef<string | null>(null);

  useEffect(() => {
    let stop = false;

    // manual QA: append ?show-update-prompt to preview the dialog
    if (window.location.search.includes("show-update-prompt")) setShow(true);

    async function check() {
      try {
        const { v } = await fetch("/api/version", { cache: "no-store" }).then((r) => r.json());
        if (stop || !v || v === "dev") return;
        if (baseline.current === null) {
          baseline.current = v;
          return;
        }
        if (v !== baseline.current && offered.current !== v) {
          if (sessionStorage.getItem("ll-skip-version") === v) return;
          offered.current = v;
          setShow(true);
        }
      } catch {
        /* offline — try again next tick */
      }
    }

    check();
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      if (offered.current) sessionStorage.setItem("ll-skip-version", offered.current);
    } catch {}
    setShow(false);
  }

  return (
    <div className="update-prompt" role="alertdialog" aria-label="Update available">
      <div className="up-card">
        <div className="up-emoji">✨</div>
        <b>The library app has been updated</b>
        <p>Refresh to get the latest version — anything you're mid-way through will reload.</p>
        <div className="up-actions">
          <button className="btn brand" onClick={() => window.location.reload()}>
            Refresh now
          </button>
          <button className="btn ghost" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
