"use client";

import { useEffect, useId } from "react";
import Modal from "@/components/Modal";
import { Ic } from "@/components/icons";
import { announce } from "@/components/Announcer";
import { fireConfetti } from "@/lib/confetti";

/** The three things worth knowing on day one — in the order you'd do them. */
const FIRST_THINGS = [
  { icon: "book", text: "Finished a book? Tap “I read this” and it joins your reading log." },
  { icon: "heart", text: "Loved it? Tap the heart on the cover to keep it in your favorites." },
  { icon: "backpack", text: "Want to take one home? “Take a Book Home” checks it out to you." },
];

/**
 * Shown once, ever, the first time a student signs in. Not a tutorial and not
 * a wall of rules — a hello, three things they can do, and a nudge toward the
 * badge shelf that's waiting for them.
 */
export default function WelcomeMoment({ name, onClose }: { name: string; onClose: () => void }) {
  const titleId = useId();

  useEffect(() => {
    fireConfetti(60);
    announce(`Welcome to the library, ${name}.`, false);
  }, [name]);

  return (
    <Modal open onClose={onClose} labelledBy={titleId} className="badgepop welcomepop">
      <div className="badgepop-body">
        <span className="welcome-spark" aria-hidden>
          <Ic name="sparkle" size={40} />
        </span>
        <h2 id={titleId}>Welcome to your library, {name}!</h2>
        <p className="badgepop-blurb">Here&rsquo;s what you can do from any book:</p>
        <ul className="welcome-list">
          {FIRST_THINGS.map((t) => (
            <li key={t.icon}>
              <Ic name={t.icon} size={17} />
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>
          There are badges to collect along the way — they show up on My Page.
        </p>
        <button type="button" className="btn primary badgepop-go" onClick={onClose}>
          Let&rsquo;s go
        </button>
      </div>
    </Modal>
  );
}
