/**
 * The library game: read books → earn stars → build your avatar.
 * Avatars are mixed-media: gradient backgrounds, emoji heads, SVG-drawn
 * bodies/legs/outfits/faces/hats (see components/AvatarParts.tsx), with
 * PNG support via `src` for future artwork (drop files in /public/avatar).
 * Items live in code (no table); slots layer bottom→top:
 * bg → legs → body → outfit → head → face → hat.
 */

export const POINTS_PER_READ = 10;
export const DAILY_READ_LIMIT = 5;

export type Slot = "bg" | "legs" | "body" | "outfit" | "head" | "face" | "hat";
export const SLOT_ORDER: Slot[] = ["bg", "legs", "body", "outfit", "head", "face", "hat"];

/** Slots that always have something equipped (tapping can't clear them). */
export const CORE_SLOTS: Slot[] = ["bg", "legs", "body", "head"];

export type AvatarItem = {
  id: string;
  slot: Slot;
  label: string;
  price: number;
  /** exactly one art source: */
  emoji?: string; // emoji art
  color?: string; // CSS background (bg slot)
  part?: string; // SVG part id in components/AvatarParts.tsx
  src?: string; // PNG/image URL (e.g. /avatar/cool-hat.png)
};

export const AVATAR_ITEMS: AvatarItem[] = [
  // ── backgrounds ──────────────────────────────────
  { id: "sky", slot: "bg", color: "linear-gradient(150deg,#7fb2ff,#c8e2ff)", label: "Sky", price: 0 },
  { id: "mint", slot: "bg", color: "linear-gradient(150deg,#7fe0b8,#d2f5e6)", label: "Mint", price: 0 },
  { id: "sunset", slot: "bg", color: "linear-gradient(150deg,#ff9a6b,#ffd3a3)", label: "Sunset", price: 40 },
  { id: "berry", slot: "bg", color: "linear-gradient(150deg,#e577b4,#f7c6e2)", label: "Berry", price: 40 },
  { id: "space", slot: "bg", color: "linear-gradient(150deg,#2b2f55,#5a5fa0)", label: "Space", price: 90 },
  { id: "gold", slot: "bg", color: "linear-gradient(150deg,#f5c95c,#fbe7ad)", label: "Gold", price: 120 },

  // ── heads (emoji; legacy `base` ids kept so old avatars carry over) ──
  { id: "fox", slot: "head", emoji: "🦊", label: "Fox", price: 0 },
  { id: "panda", slot: "head", emoji: "🐼", label: "Panda", price: 0 },
  { id: "frog", slot: "head", emoji: "🐸", label: "Frog", price: 0 },
  { id: "owl", slot: "head", emoji: "🦉", label: "Owl", price: 0 },
  { id: "tiger", slot: "head", emoji: "🐯", label: "Tiger", price: 0 },
  { id: "turtle", slot: "head", emoji: "🐢", label: "Turtle", price: 0 },
  { id: "bunny", slot: "head", emoji: "🐰", label: "Bunny", price: 0 },
  { id: "koala", slot: "head", emoji: "🐨", label: "Koala", price: 30 },
  { id: "robot", slot: "head", emoji: "🤖", label: "Robot", price: 80 },
  { id: "alien", slot: "head", emoji: "👽", label: "Alien", price: 90 },
  { id: "dragon", slot: "head", emoji: "🐲", label: "Dragon", price: 100 },
  { id: "unicorn", slot: "head", emoji: "🦄", label: "Unicorn", price: 150 },

  // ── bodies (SVG) ─────────────────────────────────
  { id: "tee", slot: "body", part: "tee", label: "Blue tee", price: 0 },
  { id: "stripes", slot: "body", part: "stripes", label: "Stripy shirt", price: 30 },
  { id: "hoodie", slot: "body", part: "hoodie", label: "Hoodie", price: 50 },
  { id: "spacesuit", slot: "body", part: "spacesuit", label: "Space suit", price: 90 },

  // ── legs (SVG) ───────────────────────────────────
  { id: "jeans", slot: "legs", part: "jeans", label: "Jeans", price: 0 },
  { id: "shorts", slot: "legs", part: "shorts", label: "Shorts", price: 20 },
  { id: "joggers", slot: "legs", part: "joggers", label: "Joggers", price: 30 },
  { id: "robolegs", slot: "legs", part: "robolegs", label: "Robo legs", price: 80 },

  // ── outfits / extras (SVG overlays) ──────────────
  { id: "scarf", slot: "outfit", part: "scarf", label: "Scarf", price: 30 },
  { id: "cape", slot: "outfit", part: "cape", label: "Hero cape", price: 60 },
  { id: "wings", slot: "outfit", part: "wings", label: "Wings", price: 120 },

  // ── facial cosmetics (SVG; legacy accessory ids kept) ──
  { id: "blush", slot: "face", part: "blush", label: "Blush", price: 15 },
  { id: "freckles", slot: "face", part: "freckles", label: "Freckles", price: 20 },
  { id: "glasses", slot: "face", part: "glasses", label: "Specs", price: 30 },
  { id: "shades", slot: "face", part: "shades", label: "Shades", price: 50 },
  { id: "starcheeks", slot: "face", part: "starcheeks", label: "Star cheeks", price: 40 },

  // ── hats (emoji + SVG; legacy ids kept) ──────────
  { id: "cap", slot: "hat", emoji: "🧢", label: "Cap", price: 30 },
  { id: "beanie", slot: "hat", part: "beanie", label: "Beanie", price: 40 },
  { id: "party", slot: "hat", part: "party", label: "Party hat", price: 50 },
  { id: "tophat", slot: "hat", emoji: "🎩", label: "Top hat", price: 60 },
  { id: "grad", slot: "hat", emoji: "🎓", label: "Grad cap", price: 80 },
  { id: "wizard", slot: "hat", part: "wizard", label: "Wizard hat", price: 120 },
  { id: "crown", slot: "hat", emoji: "👑", label: "Crown", price: 150 },
];

export const ITEM_BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));

/** Equipped items by slot. `base`/`accessory` are legacy keys (pre-studio). */
export type Avatar = Partial<Record<Slot, string>> & { base?: string; accessory?: string };

export const DEFAULT_AVATAR: Avatar = { bg: "sky", head: "fox", body: "tee", legs: "jeans" };

/** Resolve an avatar to a full, renderable set (legacy `base` → head). */
export function normalizeAvatar(a: Avatar | null | undefined): Required<Pick<Avatar, "bg" | "head" | "body" | "legs">> &
  Pick<Avatar, "outfit" | "face" | "hat"> {
  return {
    bg: a?.bg ?? "sky",
    head: a?.head ?? a?.base ?? "fox",
    body: a?.body ?? "tee",
    legs: a?.legs ?? "jeans",
    outfit: a?.outfit,
    face: a?.face,
    hat: a?.hat,
  };
}

/** Everything that's free is implicitly owned. */
export function ownsItem(owned: string[], item: AvatarItem): boolean {
  return item.price === 0 || owned.includes(item.id);
}

/** "jane.doe@students…" → "Jane D." */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  const [first, last] = local.split(/[._-]/);
  const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  return last ? `${cap(first)} ${cap(last)[0]}.` : cap(first);
}

/** "thomas.demuth@…" → "Thomas Demuth" (school emails are first.last). */
export function displayNameFull(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  return local.split(/[._-]/).filter(Boolean).map(cap).join(" ") || email;
}
