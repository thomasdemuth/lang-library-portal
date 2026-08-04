"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen-reader announcement bus. Mounted once (in the root layout), it
 * renders two visually-hidden live regions — polite (role="status") and
 * assertive (role="alert") — that any code can speak through:
 *
 *   import { announce } from "@/components/Announcer";
 *   announce("Added to Favorites");            // polite (default)
 *   announce("Couldn't save. Try again.", true); // assertive
 *
 * Messages queue: rapid calls play one at a time (clear → tick → set) so a
 * second announcement never clobbers the first before the screen reader has
 * seen the DOM change, and repeating the same text re-announces.
 */

type Msg = { text: string; assertive: boolean };

let push: ((m: Msg) => void) | null = null;
const backlog: Msg[] = [];

export function announce(message: string, assertive = false) {
  const m = { text: message, assertive };
  if (push) push(m);
  else backlog.push(m); // fired before mount (or during SSR) — flushed on mount
}

export default function Announcer() {
  const [polite, setPolite] = useState("");
  const [alert, setAlert] = useState("");
  const queue = useRef<Msg[]>([]);
  const draining = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const setters = { polite: setPolite, alert: setAlert };
    function drain() {
      const next = queue.current.shift();
      if (!next) {
        draining.current = false;
        return;
      }
      draining.current = true;
      const set = next.assertive ? setters.alert : setters.polite;
      set(""); // clear first so identical text still registers as a change
      timers.current.push(
        window.setTimeout(() => {
          set(next.text);
          timers.current.push(window.setTimeout(drain, 250));
        }, 30),
      );
    }
    push = (m) => {
      queue.current.push(m);
      if (!draining.current) drain();
    };
    if (backlog.length) {
      queue.current.push(...backlog.splice(0));
      if (!draining.current) drain();
    }
    return () => {
      push = null;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      draining.current = false;
    };
  }, []);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{polite}</div>
      <div className="sr-only" role="alert" aria-atomic="true">{alert}</div>
    </>
  );
}
