"use client";

import { useEffect, useState } from "react";
import { Ic } from "@/components/icons";
import { SENT_KEY } from "@/components/QuickFeedback";
import { withBase } from "@/lib/base";

/**
 * The relaunch banner: one line at the top of every student and teacher page
 * pointing at the feedback form. Management is excluded in CSS
 * (`body:has(.admin-grid) .newsbanner`) — the team doesn't need to be asked
 * what it thinks of its own site.
 *
 * It stops asking once someone has actually left feedback, and an × hides it
 * for 30 days. Bump BANNER_VERSION to start a fresh round of asking: the
 * dismissal key changes with it, so everyone sees the new one.
 */
const BANNER_VERSION = "v1";
const DISMISS_KEY = `lang_banner_${BANNER_VERSION}_dismissed`;
const DISMISS_DAYS = 30;

export default function UpdateBanner({ isGuest = false }: { isGuest?: boolean }) {
  // Starts hidden and appears on mount: localStorage doesn't exist during SSR,
  // and rendering it server-side would flash the banner at people who dismissed
  // it. Same reason components/UpdatePrompt.tsx returns null until it decides.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SENT_KEY)) return; // already told us — stop asking
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000) return;
    } catch {
      /* private mode: no memory of dismissals, so just show it */
    }
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  }

  // Guests can't reach /feedback — middleware confines them to Find a Book and
  // the Library Map — so send them to the public form the QR posters use.
  const href = withBase(isGuest ? "/hi/site" : "/feedback?src=banner");

  return (
    <div className="wrap" style={{ paddingTop: 12, paddingBottom: 0 }}>
      <div className="newsbanner">
        <span className="nb-spark">
          <Ic name="sparkle" size={19} />
        </span>
        <a href={href}>
          We&rsquo;ve updated the Lang Library and added new features to improve your
          experience. <span className="nb-cta">Tell us what you think &rarr;</span>
        </a>
        <button className="nb-close" onClick={dismiss} aria-label="Hide this message">
          &times;
        </button>
      </div>
    </div>
  );
}
