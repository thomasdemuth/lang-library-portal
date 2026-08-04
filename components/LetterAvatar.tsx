"use client";

import { useState } from "react";

/**
 * Google-style initial avatar: a colored circle with the first letter of
 * the display name, in a deterministic color keyed on the name (same name
 * → same color everywhere). Pass `src` (a Google profile-photo URL) to show
 * the real photo instead; if the image fails to load — Google photo URLs
 * can expire or 404 — it falls back to the initial automatically.
 */

const PALETTE = [
  "#3f6ad1", // blue
  "#2e9e6b", // green
  "#c2417f", // pink
  "#7c4dbc", // purple
  "#d97706", // amber
  "#0e8fa3", // teal
  "#c04a3a", // rust
  "#5a5fa0", // indigo
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function LetterAvatar({
  name,
  size = 40,
  src,
}: {
  /** Display name the initial + color derive from. */
  name: string;
  /** Diameter in px. */
  size?: number;
  /** Optional photo URL — renders an <img> in the same circle instead. */
  src?: string;
}) {
  // Remember which URL failed (not just a boolean) so a new src gets a
  // fresh chance after an earlier one broke.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && src !== brokenSrc;
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="letter-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44), background: showPhoto ? "transparent" : colorFor(name) }}
      aria-hidden
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          // Google's photo CDN can 403 requests that carry a referrer.
          referrerPolicy="no-referrer"
          onError={() => setBrokenSrc(src ?? null)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
