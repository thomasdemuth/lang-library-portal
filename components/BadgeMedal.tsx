import { Ic } from "@/components/icons";
import { type Badge } from "@/lib/badges";

/**
 * One badge disc.
 *
 *   earned   — filled with the badge's own color, icon in white.
 *   revealed — the same color as a dashed outline: this is the one badge in
 *              its group we're actively inviting the student to go get, so it
 *              stays colorful and named. Never greyscale, never a padlock.
 *   mystery  — a soft neutral disc with a "?". Something to find out, not
 *              something withheld.
 */
export default function BadgeMedal({
  badge,
  size = 56,
  state = "earned",
}: {
  badge: Badge;
  size?: number;
  state?: "earned" | "revealed" | "mystery";
}) {
  const inner = Math.round(size * 0.44);
  const style =
    state === "earned"
      ? { width: size, height: size, background: `radial-gradient(circle at 32% 26%, #ffffff55, transparent 58%), ${badge.color}` }
      : state === "revealed"
        ? { width: size, height: size, borderColor: badge.color, color: badge.color }
        : { width: size, height: size };
  return (
    <span className={`badge-medal badge-${state}`} style={style} aria-hidden>
      {state === "mystery" ? (
        <b style={{ fontSize: Math.round(size * 0.4) }}>?</b>
      ) : (
        <Ic name={badge.icon} size={inner} width={state === "earned" ? 2 : 1.8} />
      )}
    </span>
  );
}
