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

/** Tap-to-set row of category chips; tapping the active one clears it. */
export default function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: CategoryId | null;
  onChange: (tag: CategoryId | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="tagpicker" role="radiogroup" aria-label="Category tag">
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
            className={`tagchip${active ? " active" : ""}`}
            style={active ? { background: c.color, borderColor: c.color, color: "#fff" } : undefined}
            onClick={() => onChange(active ? null : id)}
          >
            {!active && <span className="dot" style={{ background: c.color }} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
