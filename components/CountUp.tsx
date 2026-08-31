"use client";

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/confetti";

/**
 * A number that rolls up to its new value instead of snapping — so logging a
 * book visibly *moves* the count on the page you're already looking at.
 *
 * Deliberately not inside a live region: a screen reader must not read out
 * "1, 4, 9, 12". The surrounding text is announced by the action's own toast.
 * A value that goes DOWN snaps instantly — an undo shouldn't be dramatised.
 */
export default function CountUp({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (value <= start || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <span className="countup" key={value}>{shown}</span>;
}
