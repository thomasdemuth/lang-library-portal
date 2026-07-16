"use client";

import { useEffect, useState } from "react";

/** Mac shows ⌘, everything else shows Ctrl. */
export function useIsMac(): boolean {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  return mac;
}

/** The "⌘Z to undo" nudge shown next to a just-happened notice. */
export default function UndoHint({ text = "to undo" }: { text?: string }) {
  const mac = useIsMac();
  return (
    <span className="kbd-hint">
      <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
      <kbd>Z</kbd> {text}
    </span>
  );
}
