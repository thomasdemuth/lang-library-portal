"use client";

import { useEffect } from "react";

/**
 * Honors Settings → Launch screen: when the home-screen app opens on the
 * landing page, jump once per app session to the admin's chosen tab.
 * No-op in a normal browser tab or for anyone who never set the pref.
 */
export default function LaunchRedirect() {
  useEffect(() => {
    try {
      const target = localStorage.getItem("ll-launch");
      if (!target) return;
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!standalone) return;
      if (sessionStorage.getItem("ll-launched")) return;
      sessionStorage.setItem("ll-launched", "1");
      const p = window.location.pathname;
      if (p === "/" || p === "/admin") window.location.replace(`/admin/${target}`);
    } catch {
      /* private mode etc. — just load normally */
    }
  }, []);
  return null;
}
