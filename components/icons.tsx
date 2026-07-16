/** Tiny shared stroke-icon set (server- and client-safe). */

export const ICON_PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  requests: "M4 6h16v12H4zM4 7l8 6 8-6",
  feedback: "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.5-.7L3 21l1.8-5.5A8.4 8.4 0 1 1 21 11.5z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  sign: "M4 5h13l3 3-3 3H4zM12 11v9M8 20h8",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  users: "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10.13 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.97z",
  scan: "M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h1.5M11 12h2M16.5 12H17",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6L19 15z",
  megaphone: "M3 11v3a1 1 0 0 0 1 1h2l3 5h2v-5h1l8 3V3l-8 3H6a3 3 0 0 0-3 3v2zM12 16v3",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5",
  collapse: "M11 17l-5-5 5-5M18 17l-5-5 5-5",
  expand: "M7 17l5-5-5-5M14 17l5-5-5-5",
  star: "M12 3l2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9L12 3z",
  trophy: "M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5 5-2z",
  backpack: "M9 6V5a3 3 0 0 1 6 0v1M7 6h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM8 21v-6h8v6M8 11h8",
  apple: "M12 7c0-2-1.5-3.5-1.5-3.5M12 7c1.5-2.5 4-2 4-2M12 7C8 4.8 4.5 7.6 4.5 11.6c0 4.6 3.1 8.9 7.5 8.9s7.5-4.3 7.5-8.9C19.5 7.6 16 4.8 12 7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.2 2",
  note: "M9 3h10v18H5V7l4-4zM9 3v4H5M9.5 12h7M9.5 16h7",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6.2 2 6.2H4S6 14 6 9M10 19.5a2 2 0 0 0 4 0",
  headphones: "M4 14a8 8 0 0 1 16 0M4 14v3.5a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1V15a1 1 0 0 0-1-1H4M20 14v3.5a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1V15a1 1 0 0 1 1-1h3",
  tablet: "M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM10.5 18.5h3",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01",
};

export function Ic({ name, size = 18, width = 2 }: { name: string; size?: number; width?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICON_PATHS[name] ?? ICON_PATHS.book} />
    </svg>
  );
}

/** Favorite heart. Colors/hover-fill are CSS-driven (.i-heart / .i-heart.on). */
export function Heart({ filled = false, size = 17 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`i-heart${filled ? " on" : ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

/** Read check: grey-black tick when unread, green ticked-in-a-circle when logged. */
export function Check({ done = false, size = 15 }: { done?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`i-check${done ? " on" : ""}`}
      fill="none"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {done && <circle cx="12" cy="12" r="10" strokeWidth={1.8} />}
      <path d="M7 12.4l3.3 3.3L17 8.2" />
    </svg>
  );
}

/** Pencil / edit, inherits the button's text color. */
export function Pencil({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/** Filled amber star — the "stars" currency mark. */
export function Star({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="#f5b301"
      stroke="#c98d00"
      strokeWidth={1.4}
      strokeLinejoin="round"
      aria-hidden
      style={{ verticalAlign: "-0.12em" }}
    >
      <path d="M12 3l2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9L12 3z" />
    </svg>
  );
}

const MEDAL_COLORS: Record<number, [string, string]> = {
  1: ["#f5c34b", "#c98d00"], // gold
  2: ["#c8cdd6", "#8f97a3"], // silver
  3: ["#d99a6c", "#a96a3e"], // bronze
};

/** Podium medal (1 gold / 2 silver / 3 bronze) with ribbon. */
export function Medal({ place, size = 20 }: { place: 1 | 2 | 3; size?: number }) {
  const [fill, edge] = MEDAL_COLORS[place] ?? MEDAL_COLORS[3];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ verticalAlign: "-0.15em" }}>
      <path d="M8 2h3l2 5-3.5 1L8 2z" fill="#3f6ad1" />
      <path d="M16 2h-3l-2 5 3.5 1L16 2z" fill="#2e50c8" />
      <circle cx="12" cy="14" r="7" fill={fill} stroke={edge} strokeWidth="1.6" />
      <text
        x="12"
        y="17.4"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="800"
        fill={edge}
        fontFamily="inherit"
      >
        {place}
      </text>
    </svg>
  );
}

/** Location pin, inherits the button's text color. */
export function Pin({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="i-pin"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 1 1 13 0C18.5 15.2 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  );
}
