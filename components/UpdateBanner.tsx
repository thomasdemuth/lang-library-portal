"use client";

import { useEffect, useState } from "react";
import BannerBody from "@/components/BannerBody";
import { SENT_KEY } from "@/components/QuickFeedback";
import { dismissStorageKey, isDismissed, type ClientBanner } from "@/lib/banners";

/**
 * The live announcement strip, above the top bar on every student and teacher
 * page. Which banner this is, what it says, and where it points are the library
 * team's business now (Management → Banners); what's left here is the part only
 * the browser can decide — whether this person has already dismissed it.
 *
 * Management is excluded in CSS (`body:has(.admin-grid) .newsbanner`) rather
 * than here, because the middleware rewrite means the layout can't see the
 * real path.
 */
export default function UpdateBanner({ banner }: { banner: ClientBanner }) {
  // Starts hidden and appears on mount: localStorage doesn't exist during SSR,
  // and rendering it server-side would flash it at people who dismissed it.
  const [show, setShow] = useState(false);

  useEffect(() => {
    const key = dismissStorageKey(banner);
    try {
      if (banner.hideWhenAnswered && localStorage.getItem(SENT_KEY)) return;

      // One-release courtesy: the banner that shipped hardcoded remembered its
      // dismissal under its own key. Adopt it once, then retire the old key so
      // this only ever happens on the first visit after the upgrade.
      if (banner.legacyKey) {
        const legacy = localStorage.getItem(banner.legacyKey);
        if (legacy && !localStorage.getItem(key)) localStorage.setItem(key, legacy);
        if (legacy) localStorage.removeItem(banner.legacyKey);
      }

      if (isDismissed(banner, localStorage.getItem(key), Date.now())) return;
    } catch {
      /* private mode: no memory of dismissals, so just show it */
    }
    setShow(true);
  }, [banner]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(dismissStorageKey(banner), String(Date.now()));
    } catch {}
    setShow(false);
  }

  return <BannerBody banner={banner} onDismiss={dismiss} />;
}
