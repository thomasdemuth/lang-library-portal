/**
 * The library game: read books → earn stars → dress up your avatar.
 * Items live in code (no table): each has a slot, an emoji (or color for
 * backgrounds), and a star price. Bases and the first backgrounds are free
 * so every profile starts fun.
 */

export const POINTS_PER_READ = 10;
export const DAILY_READ_LIMIT = 5;

export type Slot = "base" | "hat" | "accessory" | "bg";

export type AvatarItem = { id: string; slot: Slot; emoji?: string; color?: string; label: string; price: number };

export const AVATAR_ITEMS: AvatarItem[] = [
  // bases — free
  { id: "fox", slot: "base", emoji: "🦊", label: "Fox", price: 0 },
  { id: "panda", slot: "base", emoji: "🐼", label: "Panda", price: 0 },
  { id: "frog", slot: "base", emoji: "🐸", label: "Frog", price: 0 },
  { id: "owl", slot: "base", emoji: "🦉", label: "Owl", price: 0 },
  { id: "tiger", slot: "base", emoji: "🐯", label: "Tiger", price: 0 },
  { id: "turtle", slot: "base", emoji: "🐢", label: "Turtle", price: 0 },
  { id: "bunny", slot: "base", emoji: "🐰", label: "Bunny", price: 0 },
  { id: "dragon", slot: "base", emoji: "🐲", label: "Dragon", price: 100 },
  { id: "unicorn", slot: "base", emoji: "🦄", label: "Unicorn", price: 150 },
  // hats
  { id: "cap", slot: "hat", emoji: "🧢", label: "Cap", price: 30 },
  { id: "tophat", slot: "hat", emoji: "🎩", label: "Top hat", price: 60 },
  { id: "grad", slot: "hat", emoji: "🎓", label: "Grad cap", price: 80 },
  { id: "crown", slot: "hat", emoji: "👑", label: "Crown", price: 150 },
  { id: "wizard", slot: "hat", emoji: "🧙", label: "Wizard", price: 120 },
  // accessories
  { id: "book", slot: "accessory", emoji: "📚", label: "Book stack", price: 20 },
  { id: "glasses", slot: "accessory", emoji: "👓", label: "Glasses", price: 30 },
  { id: "shades", slot: "accessory", emoji: "🕶️", label: "Shades", price: 50 },
  { id: "rocket", slot: "accessory", emoji: "🚀", label: "Rocket", price: 70 },
  { id: "guitar", slot: "accessory", emoji: "🎸", label: "Guitar", price: 70 },
  { id: "paint", slot: "accessory", emoji: "🎨", label: "Paints", price: 60 },
  { id: "trophy", slot: "accessory", emoji: "🏆", label: "Trophy", price: 120 },
  // backgrounds — first two free
  { id: "sky", slot: "bg", color: "linear-gradient(150deg,#7fb2ff,#c8e2ff)", label: "Sky", price: 0 },
  { id: "mint", slot: "bg", color: "linear-gradient(150deg,#7fe0b8,#d2f5e6)", label: "Mint", price: 0 },
  { id: "sunset", slot: "bg", color: "linear-gradient(150deg,#ff9a6b,#ffd3a3)", label: "Sunset", price: 40 },
  { id: "berry", slot: "bg", color: "linear-gradient(150deg,#e577b4,#f7c6e2)", label: "Berry", price: 40 },
  { id: "space", slot: "bg", color: "linear-gradient(150deg,#2b2f55,#5a5fa0)", label: "Space", price: 90 },
  { id: "gold", slot: "bg", color: "linear-gradient(150deg,#f5c95c,#fbe7ad)", label: "Gold", price: 120 },
];

export const ITEM_BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));

export type Avatar = { base?: string; hat?: string; accessory?: string; bg?: string };

export const DEFAULT_AVATAR: Avatar = { base: "fox", bg: "sky" };

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
