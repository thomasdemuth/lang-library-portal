"use client";

import { useEffect, useState } from "react";

const OPTIONS = [
  ["scan", "Scan"],
  ["inventory", "Inventory"],
  ["map", "Map"],
  ["account", "Settings"],
] as const;

/**
 * Desktop editor for the app's launch screen. The preference is stored on
 * the device that opens the app, so this configures THIS browser — handy
 * for kiosk iPads/desktops, and it mirrors the phone's Settings option.
 */
export default function LaunchPrefCard() {
  const [launch, setLaunch] = useState("inventory");
  useEffect(() => {
    try {
      setLaunch(localStorage.getItem("ll-launch") ?? "inventory");
    } catch {}
  }, []);

  function apply(v: string) {
    setLaunch(v);
    try {
      localStorage.setItem("ll-launch", v);
    } catch {}
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>App launch screen</h2>
      <div className="seg" style={{ maxWidth: 420 }}>
        {OPTIONS.map(([v, label]) => (
          <button key={v} type="button" className={v === launch ? "on" : undefined} onClick={() => apply(v)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">
        Where the home-screen app opens. Saved per device — set it on your phone (Settings →
        Launch screen) to change the phone app.
      </p>
    </div>
  );
}
