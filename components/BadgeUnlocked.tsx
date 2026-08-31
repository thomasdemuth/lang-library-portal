"use client";

import { useEffect, useId } from "react";
import Modal from "@/components/Modal";
import BadgeMedal from "@/components/BadgeMedal";
import { announce } from "@/components/Announcer";
import { fireConfetti } from "@/lib/confetti";
import { BADGES, type Badge } from "@/lib/badges";

/**
 * The badge moment. Deliberately the biggest celebration in the app — a badge
 * is the rarest thing that happens here, so it gets more paper than a checkout.
 *
 * It does NOT auto-dismiss: this is a focus-trapping dialog, and one that
 * vanishes on a timer strands keyboard and screen-reader users mid-read. The
 * single "Nice!" button is the first focusable thing in the box, so Modal
 * lands focus on it and Enter closes — which is the whole interaction on the
 * take-home kiosk, where there's no mouse.
 */
export default function BadgeUnlocked({
  badge,
  collected,
  earnedAt,
  onClose,
}: {
  badge: Badge;
  /** How many of the set this student now holds — about them, never a rank. */
  collected: number;
  /** Set when re-opening an already-earned badge from the shelf. */
  earnedAt?: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const replay = earnedAt !== undefined;

  useEffect(() => {
    fireConfetti(replay ? 40 : 140);
    // Polite: assertive is for errors, and a celebration must never cut one off.
    announce(`Badge earned: ${badge.name}. ${badge.blurb}`, false);
  }, [badge, replay]);

  return (
    <Modal open onClose={onClose} labelledBy={titleId} className="badgepop">
      <div className="badgepop-body">
        <BadgeMedal badge={badge} size={104} />
        <p className="badgepop-kicker">{replay ? "Badge earned" : "You earned a badge!"}</p>
        <h2 id={titleId}>{badge.name}</h2>
        <p className="badgepop-blurb">{badge.blurb}</p>
        {earnedAt ? (
          <p className="hint" style={{ margin: 0 }}>
            Earned {new Date(earnedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
        ) : null}
        <p className="hint" style={{ margin: 0 }}>
          {collected} of {BADGES.length} badges collected
        </p>
        <button type="button" className="btn primary badgepop-go" onClick={onClose}>
          {replay ? "Close" : "Nice!"}
        </button>
      </div>
    </Modal>
  );
}
