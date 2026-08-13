"use client";

import { useRef, useState } from "react";
import { announce } from "@/components/Announcer";
import { Star } from "@/components/icons";
import { withBase } from "@/lib/base";
import { chipsFor, MAX_RATING, MAX_TAGS, MIN_RATING, ratingLabel, type Source, type Topic } from "@/lib/feedback";

/** Set on a successful send so the site-wide banner stops asking this device. */
export const SENT_KEY = "lang_feedback_sent_v1";

const RATINGS = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MIN_RATING + i);

type Props = {
  /** What we're asking about — decides which chips are offered. */
  topic: Topic;
  /** QR spot code, when this came from a poster. Server re-resolves it. */
  spot?: string;
  /** Where this submission came from, for triage. */
  source: Source;
  /** "/api/feedback" (signed in) or "/api/feedback/public" (anonymous). */
  endpoint: string;
  /** Offer an optional name box — the anonymous QR page does, the portal doesn't. */
  askName?: boolean;
};

/**
 * The whole feedback ask, in one tap if that's all someone has time for:
 * pick a star, and chips matched to that star appear alongside an optional
 * comment. Nothing is required past the star.
 *
 * Used by the portal feedback pages (signed in, posting to /api/feedback) and
 * by the public QR landing page (anonymous, posting to /api/feedback/public).
 * The chip list comes from lib/feedback so the API can verify that a submitted
 * chip is one we actually offered.
 */
export default function QuickFeedback({ topic, spot, source, endpoint, askName }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [trap, setTrap] = useState(""); // honeypot — humans never see it
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const chips = rating === null ? [] : chipsFor(topic, rating);

  function pick(next: number) {
    setRating(next);
    // The chip sets differ per rating; drop any that this rating doesn't offer.
    const allowed = new Set(chipsFor(topic, next));
    setTags((cur) => cur.filter((t) => allowed.has(t)));
    announce(`${next} of ${MAX_RATING} stars — ${ratingLabel(next)}. Pick what fits, or just send.`);
  }

  /** Arrow keys move between stars, as a radiogroup is expected to. */
  function onStarKey(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(RATINGS.length - 1, Math.max(0, index + delta));
    starRefs.current[next]?.focus();
    pick(RATINGS[next]);
  }

  function toggleTag(tag: string) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : cur.length >= MAX_TAGS ? cur : [...cur, tag]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          tags,
          topic,
          spot,
          source,
          message: message.trim() || undefined,
          name: name.trim() || undefined,
          website: trap || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send that — try again.");
        announce(data.error ?? "Couldn't send that — try again.", true);
        return;
      }
      try {
        localStorage.setItem(SENT_KEY, "1");
      } catch {
        /* private mode — the banner just keeps showing, no harm */
      }
      setSent(true);
      announce("Thank you — your feedback was sent.");
    } catch {
      setError("Couldn't reach the server — try again.");
      announce("Couldn't reach the server — try again.", true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="notice" role="status" style={{ margin: 0 }}>
        Thank you — that's in. The library team reads every one of these.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="quickfb">
      {error && <div className="error">{error}</div>}

      <div
        className="stars"
        role="radiogroup"
        aria-label={topic === "website" ? "Rate the new website" : "Rate this part of the library"}
      >
        {RATINGS.map((value, i) => (
          <button
            key={value}
            type="button"
            ref={(el) => {
              starRefs.current[i] = el;
            }}
            className={`star${rating !== null && value <= rating ? " on" : ""}`}
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} of ${MAX_RATING} — ${ratingLabel(value)}`}
            tabIndex={rating === null ? (i === 0 ? 0 : -1) : rating === value ? 0 : -1}
            onKeyDown={(e) => onStarKey(e, i)}
            onClick={() => pick(value)}
          >
            <Star filled={rating !== null && value <= rating} />
          </button>
        ))}
      </div>
      <p className="hint stars-cap" aria-hidden>
        {rating === null ? "Tap a star" : ratingLabel(rating)}
      </p>

      {rating !== null && (
        <>
          {chips.length > 0 && (
            <fieldset className="chipset">
              <legend className="lbl">What fits? (optional)</legend>
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`tagchip chip${tags.includes(chip) ? " on" : ""}`}
                  aria-pressed={tags.includes(chip)}
                  onClick={() => toggleTag(chip)}
                >
                  {chip}
                </button>
              ))}
            </fieldset>
          )}

          <div className="field">
            <label className="lbl" htmlFor="qfb-msg">
              Anything else? (optional)
            </label>
            <textarea
              id="qfb-msg"
              className="input"
              rows={3}
              maxLength={2000}
              placeholder={
                topic === "website"
                  ? "What would make it better?"
                  : "What would make this part of the library better?"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {askName && (
            <div className="field">
              <label className="lbl" htmlFor="qfb-name">
                Your name (optional — this is anonymous otherwise)
              </label>
              <input
                id="qfb-name"
                className="input"
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          {/* Honeypot: off-screen and hidden from assistive tech. Bots fill it in. */}
          <div className="sr-only" aria-hidden>
            <label htmlFor="qfb-website">Leave this empty</label>
            <input
              id="qfb-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
            />
          </div>

          <button className="btn brand qfb-send" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      )}
    </form>
  );
}
