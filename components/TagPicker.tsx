"use client";

import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";

/** Colored category pill — how a book's tag appears everywhere. */
export function TagPill({ tag, small }: { tag: CategoryId; small?: boolean }) {
  const c = CATEGORIES[tag];
  return (
    <span
      className="tagpill"
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
            className={`tagchip${active ? " active" : ""}${isSuggested ? " suggested" : ""}`}
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
