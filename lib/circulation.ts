/**
 * Circulation rules and wording, shared by the browser and the API.
 * Pure and import-free (like lib/feedback.ts) so it stays edge-safe and
 * unit-testable.
 *
 * The rules are deliberately SOFT: nothing here blocks a checkout. A kid
 * standing at the shelf with the book in hand always wins over the
 * database's opinion — the site records reality and surfaces the
 * exceptions (overdue, over the limit, more out than we own) to the
 * library team instead of policing them.
 */

/** How long a loan runs before the circulation tab shows it as overdue. */
export const LOAN_DAYS = 14;

/** Books out at once per student before we start flagging it (soft). */
export const SOFT_LIMIT = 3;

/** How the library mailbox hears about checkouts. Stored in site_settings. */
export const EMAIL_MODES = ["per_checkout", "daily_digest", "off"] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];
export const DEFAULT_EMAIL_MODE: EmailMode = "per_checkout";

export function isEmailMode(value: unknown): value is EmailMode {
  return typeof value === "string" && (EMAIL_MODES as readonly string[]).includes(value);
}

export const EMAIL_MODE_LABELS: Record<EmailMode, string> = {
  per_checkout: "Email the library on every checkout",
  daily_digest: "One daily summary email",
  off: "No checkout emails",
};

/** due_at for a checkout made at `from` (defaults to now). */
export function dueDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + LOAN_DAYS * 24 * 3600 * 1000);
}

/** Whole days until due: positive = still time, 0 = due today, negative = overdue. */
export function daysLeft(dueAtIso: string, now: Date = new Date()): number {
  const due = new Date(dueAtIso).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.floor((due - now.getTime()) / (24 * 3600 * 1000));
}

export function isOverdue(dueAtIso: string, now: Date = new Date()): boolean {
  return daysLeft(dueAtIso, now) < 0;
}

/** "due in 5 days" / "due today" / "3 days overdue" */
export function dueLabel(dueAtIso: string, now: Date = new Date()): string {
  const left = daysLeft(dueAtIso, now);
  if (left > 1) return `due in ${left} days`;
  if (left === 1) return "due tomorrow";
  if (left === 0) return "due today";
  const over = -left;
  return `${over} day${over === 1 ? "" : "s"} overdue`;
}

/** Whole days since a checkout was made — "time since taken". */
export function daysOut(createdAtIso: string, now: Date = new Date()): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / (24 * 3600 * 1000)));
}

/** "today" / "yesterday" / "12 days ago" */
export function outLabel(createdAtIso: string, now: Date = new Date()): string {
  const days = daysOut(createdAtIso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The borrower must be a school account. Teachers can check out on any
 * student's behalf (and on their own), so both domains are accepted.
 */
export function isSchoolEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._%+-]*@(students\.)?thelangschool\.org$/.test(e);
}
