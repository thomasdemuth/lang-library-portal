"use client";

import {
  CATEGORIES,
  CATEGORY_IDS,
  MAP_CATEGORIES,
  pillTextClass,
  type CategoryId,
} from "@/lib/categories";

/** Colored category pill — how a book's tag appears everywhere.
 *  The three light category colors (Comics, Games, Drama) can't carry white
 *  text, so the pill picks its own ink from the tag via pillTextClass — every
 *  caller, admin and student alike, gets a legible label without asking.
 *  `className` stays additive on top of that. */
export function TagPill({ tag, small, className }: { tag: CategoryId; small?: boolean; className?: string }) {
  const c = CATEGORIES[tag];
  // Deduped, so a caller that also passes pill-dk (the student surfaces did,
  // before the rule moved in here) doesn't emit the class twice.
  const classes = ["tagpill", pillTextClass(tag), className ?? ""]
    .flatMap((s) => s.split(" "))
    .filter((s, i, all) => s && all.indexOf(s) === i)
    .join(" ");
  return (
    <span
      className={classes}
      style={{
        background: c.color,
        fontSize: small ? 10.5 : 12,
        padding: small ? "2px 8px" : "4px 11px",
      }}
    >
      {c.label}
    </span>
  );
}

/**
 * Tap-to-set row of category chips; tapping the active one clears it.
 * Pass `suggested` to draw a dotted outline around the chip the
 * auto-tagger recommends, with a small "suggested" caption.
 */
export default function TagPicker({
  value,
  onChange,
  disabled,
  suggested,
  dots,
}: {
  value: CategoryId | null;
  onChange: (tag: CategoryId | null) => void;
  disabled?: boolean;
  suggested?: CategoryId | null;
  /** Compact swatch row — just color dots, no labels (keeps table cells from resizing). */
  dots?: boolean;
}) {
  if (dots) {
    return (
      <div className="tagdots" role="radiogroup" aria-label="Category tag">
        {CATEGORY_IDS.map((id) => {
          const c = CATEGORIES[id];
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              className={`tagdot${active ? " active" : ""}`}
              style={{ background: c.color }}
              title={active ? `Clear ${c.label}` : c.label}
              aria-label={c.label}
              onClick={() => onChange(active ? null : id)}
            />
          );
        })}
        <button
          type="button"
          disabled={disabled}
          className={`tagdot tagdot-clear${value === null ? " active" : ""}`}
          title="No tag"
          aria-label="No tag"
          onClick={() => onChange(null)}
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <div className="tagpicker" role="radiogroup" aria-label="Category tag">
      {CATEGORY_IDS.map((id) => {
        const c = CATEGORIES[id];
        const active = value === id;
        const isSuggested = !active && value === null && suggested === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            // An active chip is painted with the category color, so it needs
            // the same dark-ink treatment the pills get on the light three.
            className={`tagchip${active ? ` active ${pillTextClass(id)}` : ""}${isSuggested ? " suggested" : ""}`}
            style={
              active
                ? { background: c.color, borderColor: c.color, color: "#fff" }
                : isSuggested
                  ? { borderColor: c.color }
                  : undefined
            }
            onClick={() => onChange(active ? null : id)}
          >
            {!active && <span className="dot" style={{ background: c.color }} />}
            {c.label}
            {isSuggested && <small className="sug-mini">suggested</small>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Teachers pill — dark silver, and deliberately a separate mark from the
 * category pill: a book can be Fiction *and* for teachers, so the two sit side
 * by side rather than one replacing the other.
 */
export function TeachersPill({ small }: { small?: boolean }) {
  const c = MAP_CATEGORIES.teachers;
  return (
    <span
      className={`tagpill ${pillTextClass("teachers")}`}
      style={{
        background: c.color,
        fontSize: small ? 10.5 : 12,
        padding: small ? "2px 8px" : "4px 11px",
      }}
      title="Only teachers and management can see this book"
    >
      {c.label}
    </span>
  );
}

/**
 * The Teachers toggle. Additive, so it's a checkbox-shaped chip rather than
 * part of the category radiogroup — turning it on doesn't clear the book's
 * category, and a book can carry it with no category at all.
 */
export function TeachersToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const c = MAP_CATEGORIES.teachers;
  return (
    <button
      type="button"
      aria-pressed={value}
      disabled={disabled}
      className={`tagchip${value ? ` active ${pillTextClass("teachers")}` : ""}`}
      style={value ? { background: c.color, borderColor: c.color, color: "#fff" } : undefined}
      title={
        value
          ? "Students can't see this book — tap to put it back in the library"
          : "Hide this book from students; only teachers and management will see it"
      }
      onClick={() => onChange(!value)}
    >
      {!value && <span className="dot" style={{ background: c.color }} />}
      Teachers
    </button>
  );
}
