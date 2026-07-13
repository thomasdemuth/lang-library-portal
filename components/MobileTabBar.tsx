"use client";

import { useEffect, useState } from "react";

const ICONS = {
  scan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M7 12h1.5M11 12h2M16.5 12H17" strokeWidth="2.6" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10.13 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.97z" />
    </svg>
  ),
};

const TABS = [
  { href: "/admin/scan", label: "Scan", icon: "scan", need: "scan" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory", need: "inventory" },
  { href: "/admin/map", label: "Map", icon: "map", need: "map" },
  { href: "/admin/account", label: "Settings", icon: "settings", need: null },
] as const;

/**
 * The phone app shell: a fixed bottom tab bar (mobile only — CSS hides it on
 * desktop, where the sidebar navigation remains).
 */
export default function MobileTabBar({
  canScan,
  canInventory,
  canMap,
}: {
  canScan: boolean;
  canInventory: boolean;
  canMap: boolean;
}) {
  // Active tab from the real browser URL (rewrite-proof), set after mount.
  const [path, setPath] = useState("");
  useEffect(() => setPath(window.location.pathname), []);
  const allowed = { scan: canScan, inventory: canInventory, map: canMap };

  return (
    <nav className="tabbar" aria-label="App navigation">
      {TABS.filter((t) => t.need === null || allowed[t.need]).map((t) => (
        <a key={t.href} href={t.href} className={path.startsWith(t.href) ? "active" : undefined}>
          {ICONS[t.icon]}
          {t.label}
        </a>
      ))}
    </nav>
  );
}
