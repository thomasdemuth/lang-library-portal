"use client";

import { useEffect, useState } from "react";
import { useIsMac } from "@/components/UndoHint";
import { SHORTCUTS_PREF, type NavShortcut } from "@/lib/shortcuts";

/**
 * The keyboard shortcuts panel on My Account: the full reference for this
 * admin (only the pages they can actually open) plus a per-device switch,
 * for anyone who'd rather their ⌘Z stayed out of the way.
 */
export default function KeyboardShortcutsCard({ links }: { links: NavShortcut[] }) {
  const mac = useIsMac();
  const [on, setOn] = useState(true);
  const mod = mac ? "⌘" : "Ctrl";
  const alt = mac ? "⌥" : "Alt";

  useEffect(() => {
    try {
      setOn(localStorage.getItem(SHORTCUTS_PREF) !== "off");
    } catch {}
  }, []);

  function toggle() {
    setOn((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(SHORTCUTS_PREF, next ? "on" : "off");
      } catch {}
      return next;
    });
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Keyboard shortcuts</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Shortcuts work anywhere in management, except while you're typing in a box — there,{" "}
        <kbd>{mod}</kbd>
        <kbd>Z</kbd> stays your browser's normal text undo. This switch applies to this device.
      </p>

      <label className="check">
        <input type="checkbox" checked={on} onChange={toggle} />
        Use keyboard shortcuts on this device
      </label>

      <div className={`kbd-table${on ? "" : " off"}`}>
        <h3 className="kbd-group">Editing</h3>
        <div className="kbd-row">
          <span className="kbd-keys">
            <kbd>{mod}</kbd>
            <kbd>Z</kbd>
          </span>
          <span>Undo the last change</span>
        </div>
        <div className="kbd-row">
          <span className="kbd-keys">
            <kbd>{mod}</kbd>
            <kbd>⇧</kbd>
            <kbd>Z</kbd>
          </span>
          <span>Redo it</span>
        </div>

        <h3 className="kbd-group">Go to</h3>
        {links.map((l) => (
          <div className="kbd-row" key={l.key}>
            <span className="kbd-keys">
              <kbd>{alt}</kbd>
              <kbd>{l.key}</kbd>
            </span>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
