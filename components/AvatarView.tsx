import { ITEM_BY_ID, normalizeAvatar, SLOT_ORDER, type Avatar, type Slot } from "@/lib/play";
import AvatarPart from "@/components/AvatarParts";

/** Where each slot's art sits on the avatar canvas (percent boxes). */
const LAYER_BOX: Record<Exclude<Slot, "bg">, { left: number; top: number; width: number; height: number }> = {
  legs: { left: 24, top: 62, width: 52, height: 36 },
  body: { left: 12, top: 38, width: 76, height: 40 },
  outfit: { left: 8, top: 34, width: 84, height: 46 },
  head: { left: 15, top: -2, width: 70, height: 54 },
  face: { left: 29, top: 26, width: 42, height: 15 },
  hat: { left: 30, top: -14, width: 40, height: 28 },
};

/** Emoji art scales relative to the avatar size, per slot. */
const EMOJI_SCALE: Partial<Record<Slot, number>> = { head: 0.46, hat: 0.24, face: 0.14, body: 0.3, legs: 0.24, outfit: 0.3 };

/**
 * A student's layered avatar. Slots stack bottom→top (bg, legs, body,
 * outfit, head, face, hat); each item renders as an SVG part, an emoji,
 * or a PNG (`src`), so art styles can mix freely. Legacy avatars
 * (pre-studio `base` key) render via normalizeAvatar.
 */
export default function AvatarView({ avatar, size = 64 }: { avatar: Avatar; size?: number }) {
  const a = normalizeAvatar(avatar);
  const bg = ITEM_BY_ID.get(a.bg)?.color ?? "linear-gradient(150deg,#7fb2ff,#c8e2ff)";

  return (
    <span className="pavatar" style={{ width: size, height: size, background: bg }} aria-hidden>
      {SLOT_ORDER.filter((s): s is Exclude<Slot, "bg"> => s !== "bg").map((slot) => {
        const id = a[slot];
        if (!id) return null;
        const item = ITEM_BY_ID.get(id);
        if (!item) return null;
        const box = LAYER_BOX[slot];
        return (
          <span
            key={slot}
            className="pavatar-layer"
            style={{
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          >
            {item.part ? (
              <AvatarPart id={item.part} />
            ) : item.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : item.emoji ? (
              <span style={{ fontSize: size * (EMOJI_SCALE[slot] ?? 0.3), lineHeight: 1 }}>{item.emoji}</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
