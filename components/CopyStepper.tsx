"use client";

export const MIN_COPIES = 1;
export const MAX_COPIES = 999;

export function clampCopies(n: number): number {
  if (!Number.isFinite(n)) return MIN_COPIES;
  return Math.max(MIN_COPIES, Math.min(MAX_COPIES, Math.round(n)));
}

/**
 * − / count / + control for a book's copies. The middle stays typeable
 * (fastest way to jump from 1 to 30) while the buttons handle the common
 * one-at-a-time nudge. Empty input is allowed while typing and settles
 * back to a valid number on blur.
 */
export default function CopyStepper({
  value,
  onChange,
  disabled,
  label = "copies",
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(clampCopies(value - 1))}
        disabled={disabled || value <= MIN_COPIES}
        aria-label={`One fewer ${label}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        className="stepper-val"
        value={value}
        disabled={disabled}
        inputMode="numeric"
        aria-label={`Number of ${label}`}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          if (raw === "") return; // mid-edit; keep the last good value
          onChange(clampCopies(parseInt(raw, 10)));
        }}
      />
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(clampCopies(value + 1))}
        disabled={disabled || value >= MAX_COPIES}
        aria-label={`One more ${label}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
