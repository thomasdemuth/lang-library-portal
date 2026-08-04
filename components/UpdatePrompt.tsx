"use client";

import { useEffect, useRef, useState } from "react";
import { announce } from "@/components/Announcer";
import { Ic } from "@/components/icons";

const POLL_MS = 5 * 60 * 1000;
// Tab switches can come in bursts — one version check a minute is plenty.
const VISIBLE_MIN_GAP_MS = 60 * 1000;

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
    let lastCheck = 0;

    // manual QA: append ?show-update-prompt to preview the dialog
    if (window.location.search.includes("show-update-prompt")) setShow(true);

    async function check() {
      lastCheck = Date.now();
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
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < VISIBLE_MIN_GAP_MS) return;
      check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // role="alertdialog" only speaks when something moves focus into it, and
  // this banner deliberately doesn't steal focus mid-task — so say it out
  // loud instead. Polite: it's news, not an error, and it can wait for
  // whatever the reader is in the middle of.
  useEffect(() => {
    if (show) {
      announce("The library app has been updated. Refresh to get the latest version, or choose Not now.");
    }
  }, [show]);

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
        <div className="up-emoji"><Ic name="sparkle" size={30} /></div>
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
