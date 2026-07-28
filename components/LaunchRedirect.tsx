"use client";

import { useEffect } from "react";

/** Paths that count as "the app just opened here" for an admin. */
function isLandingPath(p: string): boolean {
  // "/" is the manifest start_url; "/admin" is where the unified host sends
  // an admin from there; /staff/<id> is the portal home a stale link or an
  // older session can still land on.
  return p === "/" || p === "/admin" || /^\/staff\/[^/]+\/?$/.test(p);
}

/**
 * Honors Settings → Launch screen: when the home-screen app opens on a
 * landing page, jump once per app session to the admin's chosen tab —
 * Inventory by default, so the app never opens on the desktop-style home.
 * No-op in a normal browser tab.
 */
export default function LaunchRedirect() {
  useEffect(() => {
    try {
      const target = localStorage.getItem("ll-launch") ?? "inventory";
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!standalone) return;
      if (sessionStorage.getItem("ll-launched")) return;
      // Claim the one shot up front: only the app's very first page can jump.
      sessionStorage.setItem("ll-launched", "1");
      if (isLandingPath(window.location.pathname)) window.location.replace(`/admin/${target}`);
    } catch {
      /* private mode etc. — just load normally */
    }
  }, []);
  return null;
}
