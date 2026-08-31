"use client";

import { useEffect, useState } from "react";
import BadgeMedal from "@/components/BadgeMedal";
import BadgeUnlocked from "@/components/BadgeUnlocked";
import { Ic } from "@/components/icons";
import { BADGES, badgeProgress, nextInGroup, type Badge } from "@/lib/badges";
import { badgeState, getBadges, onBadgesChange, type BadgeState } from "@/lib/badges-client";

/**
 * "My badges" on My Page — the collection.
 *
 * The whole set is always on screen, because a collection you can't see isn't
 * one you can want. What varies is how much each slot gives away:
 *
 *   • earned   — bright, named, with the date it was earned.
 *   • revealed — the nearest unearned badge in EVERY group, named, with what
 *                to do and how far along. So whatever a reader is into, there
 *                is always one concrete, reachable thing in front of them.
 *   • mystery  — everything further out, as a "?". Something to discover.
 *
 * What it never does is show a grid of grey padlocks, or count what's missing.
 * The header counts what you HAVE.
 */
export default function BadgeShelf() {
  const [state, setState] = useState<BadgeState>(badgeState());
  const [open, setOpen] = useState<Badge | null>(null);

  useEffect(() => {
    getBadges().then(setState);
    return onBadgesChange(setState);
  }, []);

  const { stats, earned, earnedAt } = state;
  const revealed = nextInGroup(stats);
  const count = earned.size;

  return (
    <div className="card badge-card" style={{ marginBottom: 14 }}>
      <h2>
        <Ic name="sparkle" size={16} /> My badges
        {count > 0 ? ` · ${count} collected` : ""}
      </h2>

      {count === 0 ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Your first badge is one tap away — press &ldquo;I read this&rdquo; on a book you&rsquo;ve finished.
        </p>
      ) : count === BADGES.length ? (
        <p className="hint" style={{ marginTop: 0 }}>
          You&rsquo;ve collected every badge in the library. That&rsquo;s the whole set.
        </p>
      ) : null}

      <div className="badge-grid">
        {BADGES.map((b) => {
          const has = earned.has(b.slug);
          const isNext = !has && revealed.get(b.group)?.slug === b.slug;
          const { value, goal } = badgeProgress(b, stats);
          const when = earnedAt.get(b.slug);

          if (has) {
            return (
              <button
                type="button"
                key={b.slug}
                className="badge-cell badge-got"
                onClick={() => setOpen(b)}
                title={when ? `Earned ${new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : b.blurb}
              >
                <BadgeMedal badge={b} size={48} state="earned" />
                <b>{b.name}</b>
              </button>
            );
          }

          if (isNext) {
            return (
              <div key={b.slug} className="badge-cell badge-aim">
                <BadgeMedal badge={b} size={48} state="revealed" />
                <b>{b.name}</b>
                <span className="badge-nudge">{b.nudge(Math.max(1, goal - value))}</span>
                {goal > 1 && (
                  <span
                    className="badge-bar"
                    role="img"
                    aria-label={`${value} of ${goal} toward ${b.name}`}
                  >
                    <i style={{ width: `${Math.round((value / goal) * 100)}%`, background: b.color }} />
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={b.slug} className="badge-cell badge-hidden" title="Keep going to find out!">
              <BadgeMedal badge={b} size={48} state="mystery" />
              <b aria-label="A badge you haven't found yet">???</b>
            </div>
          );
        })}
      </div>

      {open && (
        <BadgeUnlocked
          badge={open}
          collected={count}
          earnedAt={earnedAt.get(open.slug) ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
