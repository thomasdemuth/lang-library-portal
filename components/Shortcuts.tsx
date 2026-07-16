"use client";

import { useCallback, useEffect, useState } from "react";
import { runRedo, runUndo } from "@/lib/undo";
import { shortcutsEnabled, type NavShortcut } from "@/lib/shortcuts";

/** Is the caret in a field? Then ⌘Z belongs to the browser, not us. */
function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
}

/**
 * Keyboard shortcuts for the management app, mounted once in the shell:
 *   ⌘Z / Ctrl+Z          undo the last reversible action
 *   ⌘⇧Z / Ctrl+Shift+Z   redo it
 *   Alt/Option + 1–9     jump to a management page
 *
 * A short toast confirms what was undone or redone, since the action that
 * changed may be scrolled out of view.
 */
export default function Shortcuts({ links }: { links: NavShortcut[] }) {
  const [toast, setToast] = useState<string | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 2600);
  }, []);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.altKey && e.code === "KeyZ") {
        // Let fields keep their own text undo.
        if (isTyping(e.target)) return;
        if (!shortcutsEnabled()) return;
        e.preventDefault();
        const label = e.shiftKey ? await runRedo() : await runUndo();
        if (label) say(e.shiftKey ? `Redid: ${label}` : `Undid: ${label}`);
        else say(e.shiftKey ? "Nothing to redo" : "Nothing to undo");
        return;
      }

      // Option+1 on macOS types “¡”, so match the physical key, not e.key.
      if (e.altKey && !mod && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        if (isTyping(e.target)) return;
        if (!shortcutsEnabled()) return;
        const hit = links.find((l) => l.key === e.code.slice(-1));
        if (!hit) return;
        e.preventDefault();
        if (window.location.pathname !== hit.href) window.location.href = hit.href;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [links, say]);

  if (!toast) return null;
  return <div className="kbd-toast">{toast}</div>;
}
