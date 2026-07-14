import { ITEM_BY_ID, type Avatar } from "@/lib/play";

/** A student's avatar: base animal on a background, hat up top, buddy item below. */
export default function AvatarView({ avatar, size = 64 }: { avatar: Avatar; size?: number }) {
  const bg = avatar.bg ? ITEM_BY_ID.get(avatar.bg)?.color : undefined;
  const base = avatar.base ? ITEM_BY_ID.get(avatar.base)?.emoji : "🦊";
  const hat = avatar.hat ? ITEM_BY_ID.get(avatar.hat)?.emoji : null;
  const accessory = avatar.accessory ? ITEM_BY_ID.get(avatar.accessory)?.emoji : null;
  return (
    <span
      className="pavatar"
      style={{ width: size, height: size, background: bg ?? "linear-gradient(150deg,#7fb2ff,#c8e2ff)" }}
      aria-hidden
    >
      <span className="pavatar-base" style={{ fontSize: size * 0.52 }}>{base}</span>
      {hat && <span className="pavatar-hat" style={{ fontSize: size * 0.34 }}>{hat}</span>}
      {accessory && <span className="pavatar-acc" style={{ fontSize: size * 0.3 }}>{accessory}</span>}
    </span>
  );
}
