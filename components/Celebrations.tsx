"use client";

import { useEffect, useState } from "react";
import BadgeUnlocked from "@/components/BadgeUnlocked";
import WelcomeMoment from "@/components/WelcomeMoment";
import { displayName } from "@/lib/play";
import { badgeState, getBadges, markSeen, markWelcomed, onCelebrate, type Celebration } from "@/lib/badges-client";

/**
 * The one place celebrations are shown. Mounted in the student layout, so any
 * surface can earn a badge without knowing this exists — it just calls
 * refreshBadges() and the pop-up appears over whatever page it's on. That's
 * what lets a badge earned at the take-home kiosk celebrate on the kiosk.
 *
 * Celebrations queue rather than stack: two badges from one action are shown
 * one after the other, never two dialogs deep.
 */
export default function Celebrations({ email }: { email: string }) {
  const [queue, setQueue] = useState<Celebration[]>([]);

  useEffect(() => {
    const off = onCelebrate((c) => setQueue((q) => [...q, c]));
    getBadges(); // first load — also delivers the welcome and any unseen badges
    return off;
  }, []);

  const current = queue[0];
  if (!current) return null;

  function dismiss() {
    setQueue((q) => q.slice(1));
    if (current.kind === "welcome") markWelcomed();
    else markSeen([current.badge.slug]);
  }

  if (current.kind === "welcome") {
    return <WelcomeMoment name={displayName(email).split(" ")[0]} onClose={dismiss} />;
  }
  return (
    <BadgeUnlocked
      key={current.badge.slug}
      badge={current.badge}
      collected={badgeState().earned.size}
      onClose={dismiss}
    />
  );
}
