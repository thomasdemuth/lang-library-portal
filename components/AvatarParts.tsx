/**
 * Hand-drawn SVG avatar parts. Each part fills a 100×100 viewBox and is
 * scaled into its slot's layer box by AvatarView — bodies draw a torso with
 * arms, legs draw legs + shoes, faces draw across the head's eye line, hats
 * sit above the head. Flat shapes, soft strokes, kid-friendly.
 */

const INK = "#2b3140";

/** Shared torso silhouette (arms + body), tinted per shirt. */
function Torso({ fill, darker, children }: { fill: string; darker: string; children?: React.ReactNode }) {
  return (
    <>
      {/* arms */}
      <rect x="2" y="22" width="18" height="46" rx="9" fill={darker} />
      <rect x="80" y="22" width="18" height="46" rx="9" fill={darker} />
      {/* torso */}
      <path d="M22 28 Q22 12 38 10 L62 10 Q78 12 78 28 L78 86 Q78 96 66 96 L34 96 Q22 96 22 86 Z" fill={fill} />
      {/* neck notch */}
      <path d="M40 10 Q50 20 60 10" fill="none" stroke={darker} strokeWidth="3" strokeLinecap="round" />
      {children}
    </>
  );
}

const PARTS: Record<string, React.ReactNode> = {
  // ── bodies ───────────────────────────────────────
  tee: <Torso fill="#4f74e3" darker="#3c5cc0" />,
  stripes: (
    <Torso fill="#f4f6fb" darker="#d8dde9">
      <path d="M22 34 H78 M22 50 H78 M22 66 H78 M22 82 H78" stroke="#d23b4e" strokeWidth="7" />
      <path d="M22 28 Q22 12 38 10 L62 10 Q78 12 78 28 L78 86 Q78 96 66 96 L34 96 Q22 96 22 86 Z" fill="none" />
    </Torso>
  ),
  hoodie: (
    <Torso fill="#7a8496" darker="#626b7c">
      <path d="M34 10 Q50 26 66 10 Q66 2 50 2 Q34 2 34 10 Z" fill="#626b7c" />
      <path d="M44 22 v12 M56 22 v12" stroke="#f4f6fb" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M34 70 h32 v18 h-32 z" rx="6" fill="#6b7487" />
    </Torso>
  ),
  spacesuit: (
    <Torso fill="#eef1f7" darker="#c9d1e0">
      <ellipse cx="50" cy="14" rx="18" ry="7" fill="#9aa5ba" />
      <circle cx="50" cy="46" r="10" fill="#4f74e3" stroke="#3c5cc0" strokeWidth="3" />
      <path d="M28 66 h44 M28 76 h44" stroke="#c9d1e0" strokeWidth="4" strokeLinecap="round" />
    </Torso>
  ),

  // ── legs ─────────────────────────────────────────
  jeans: (
    <>
      <rect x="28" y="0" width="19" height="70" rx="7" fill="#3a5db8" />
      <rect x="53" y="0" width="19" height="70" rx="7" fill="#3a5db8" />
      <ellipse cx="36" cy="82" rx="15" ry="10" fill={INK} />
      <ellipse cx="64" cy="82" rx="15" ry="10" fill={INK} />
    </>
  ),
  shorts: (
    <>
      <rect x="28" y="0" width="19" height="34" rx="7" fill="#3f8f5f" />
      <rect x="53" y="0" width="19" height="34" rx="7" fill="#3f8f5f" />
      <rect x="31" y="34" width="13" height="36" rx="6" fill="#f4f6fb" />
      <rect x="56" y="34" width="13" height="36" rx="6" fill="#f4f6fb" />
      <ellipse cx="36" cy="82" rx="15" ry="10" fill="#d23b4e" />
      <ellipse cx="64" cy="82" rx="15" ry="10" fill="#d23b4e" />
    </>
  ),
  joggers: (
    <>
      <rect x="28" y="0" width="19" height="70" rx="7" fill="#3a4152" />
      <rect x="53" y="0" width="19" height="70" rx="7" fill="#3a4152" />
      <path d="M37 2 v64 M62 2 v64" stroke="#f4f6fb" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="36" cy="82" rx="15" ry="10" fill="#f4f6fb" />
      <ellipse cx="64" cy="82" rx="15" ry="10" fill="#f4f6fb" />
    </>
  ),
  robolegs: (
    <>
      <rect x="30" y="0" width="15" height="64" rx="5" fill="#9aa5ba" />
      <rect x="55" y="0" width="15" height="64" rx="5" fill="#9aa5ba" />
      <circle cx="37.5" cy="30" r="6" fill="#626b7c" />
      <circle cx="62.5" cy="30" r="6" fill="#626b7c" />
      <rect x="24" y="72" width="27" height="14" rx="5" fill="#626b7c" />
      <rect x="49" y="72" width="27" height="14" rx="5" fill="#626b7c" />
    </>
  ),

  // ── outfits ──────────────────────────────────────
  scarf: (
    <>
      <rect x="26" y="4" width="48" height="15" rx="7" fill="#d23b4e" />
      <rect x="56" y="14" width="14" height="34" rx="6" fill="#b92f41" />
      <path d="M58 46 v7 M63 48 v7 M68 46 v7" stroke="#b92f41" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  cape: (
    <>
      <path d="M24 10 Q6 50 12 92 L30 78 Z" fill="#8a44c9" />
      <path d="M76 10 Q94 50 88 92 L70 78 Z" fill="#8a44c9" />
      <path d="M24 10 Q50 22 76 10" fill="none" stroke="#6f33a6" strokeWidth="6" strokeLinecap="round" />
      <circle cx="50" cy="14" r="5" fill="#f5c34b" />
    </>
  ),
  wings: (
    <>
      <path d="M22 30 Q0 18 4 44 Q8 66 26 62 Z" fill="#f4f6fb" stroke="#c9d1e0" strokeWidth="3" />
      <path d="M78 30 Q100 18 96 44 Q92 66 74 62 Z" fill="#f4f6fb" stroke="#c9d1e0" strokeWidth="3" />
    </>
  ),

  // ── faces ────────────────────────────────────────
  glasses: (
    <>
      <circle cx="30" cy="50" r="17" fill="rgba(255,255,255,.22)" stroke={INK} strokeWidth="5" />
      <circle cx="70" cy="50" r="17" fill="rgba(255,255,255,.22)" stroke={INK} strokeWidth="5" />
      <path d="M47 50 h6 M2 44 l11 3 M98 44 l-11 3" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  shades: (
    <>
      <rect x="12" y="34" width="34" height="28" rx="9" fill={INK} />
      <rect x="54" y="34" width="34" height="28" rx="9" fill={INK} />
      <path d="M46 44 h8 M2 40 l10 2 M98 40 l-10 2" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M20 42 q6 -4 12 0" stroke="#8b93a5" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  blush: (
    <>
      <ellipse cx="22" cy="58" rx="13" ry="8" fill="#ff8fa8" opacity=".75" />
      <ellipse cx="78" cy="58" rx="13" ry="8" fill="#ff8fa8" opacity=".75" />
    </>
  ),
  freckles: (
    <>
      {[14, 24, 34].map((x, i) => (
        <circle key={`l${i}`} cx={x} cy={56 + (i % 2) * 7} r="3.4" fill="#a9744b" />
      ))}
      {[66, 76, 86].map((x, i) => (
        <circle key={`r${i}`} cx={x} cy={56 + ((i + 1) % 2) * 7} r="3.4" fill="#a9744b" />
      ))}
    </>
  ),
  starcheeks: (
    <>
      <path d="M22 48l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#f5c34b" stroke="#c98d00" strokeWidth="2" />
      <path d="M78 48l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#f5c34b" stroke="#c98d00" strokeWidth="2" />
    </>
  ),

  // ── hats ─────────────────────────────────────────
  beanie: (
    <>
      <path d="M18 78 Q18 30 50 30 Q82 30 82 78 Z" fill="#e2574c" />
      <rect x="14" y="72" width="72" height="18" rx="9" fill="#c74136" />
      <path d="M26 76 v10 M38 74 v14 M50 74 v14 M62 74 v14 M74 76 v10" stroke="#e2574c" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="50" cy="26" r="9" fill="#f4f6fb" />
    </>
  ),
  party: (
    <>
      <path d="M50 6 L76 88 L24 88 Z" fill="#4f74e3" />
      <path d="M39 42 L64 34 M32 64 L72 52 M27 84 L77 70" stroke="#f5c34b" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="8" r="8" fill="#e2574c" />
    </>
  ),
  wizard: (
    <>
      <path d="M50 2 L72 76 L28 76 Z" fill="#6f33a6" />
      <ellipse cx="50" cy="80" rx="40" ry="12" fill="#8a44c9" />
      <path d="M48 34l2.4 4.8 5.6.8-4 4 1 5.4-5-2.6-5 2.6 1-5.4-4-4 5.6-.8z" fill="#f5c34b" />
    </>
  ),
};

/** Render one SVG avatar part (unknown ids render nothing). */
export default function AvatarPart({ id }: { id: string }) {
  const art = PARTS[id];
  if (!art) return null;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: "block", overflow: "visible" }}>
      {art}
    </svg>
  );
}
