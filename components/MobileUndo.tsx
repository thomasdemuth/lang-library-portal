"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { onUndoChange, peekUndo, runRedo, runUndo } from "@/lib/undo";

/**
 * The phone's stand-in for ⌘Z: a pill above the tab bar that appears as soon
 * as something reversible has happened, and disappears when the history is
 * empty. Undoing leaves a confirmation carrying Redo — without it there'd be
 * no way back on a device with no ⌘⇧Z. CSS keeps this off desktop, where the
 * keyboard shortcuts and their hints already cover it.
 */
export default function MobileUndo() {
  const label = useSyncExternalStore(onUndoChange, peekUndo, () => null);
  const [toast, setToast] = useState<{ text: string; canRedo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, canRedo: boolean) => {
    setToast({ text, canRedo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const step = useCallback(
    async (dir: "undo" | "redo") => {
      setBusy(true);
      const done = dir === "undo" ? await runUndo() : await runRedo();
      setBusy(false);
      if (done) say(dir === "undo" ? `Undid: ${done}` : `Redid: ${done}`, dir === "undo");
      else say(`Couldn't ${dir} that`, false);
    },
    [say]
  );

  if (!label && !toast) return null;

  return (
    <div className="undo-bar">
      {toast && (
        <div className="undo-toast">
          <span className="undo-toast-text">{toast.text}</span>
          {toast.canRedo && (
            <button type="button" className="undo-toast-action" onClick={() => step("redo")} disabled={busy}>
              Redo
            </button>
          )}
        </div>
      )}
      {label && (
        <button
          type="button"
          className="undo-fab"
          onClick={() => step("undo")}
          disabled={busy}
          aria-label={`Undo: ${label}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
          Undo
        </button>
      )}
    </div>
  );
}
