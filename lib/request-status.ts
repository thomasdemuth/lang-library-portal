/**
 * Book-request lifecycle rules. Pure, dependency-free, unit-tested — the admin
 * PATCH route is the only enforcement point, so the rules live here where they
 * can be reasoned about (and tested) without a database.
 *
 * The shape of the flow:
 *
 *     new ──▶ in_progress ──▶ ordered ──▶ ready ✦
 *      │           │             │
 *      └───────────┴─────────────┴──────▶ declined ──▶ new (reopen)
 *
 * `ready` is terminal: once a teacher has been told their book is waiting for
 * them, silently walking the status backwards would make that email a lie.
 * `declined` may be reopened (mistakes happen, budgets free up), which sends
 * the request back to `new` — and re-arms the 72h chase-up reminder.
 */

export const REQUEST_STATUSES = ["new", "in_progress", "ordered", "ready", "declined"] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses whose arrival is worth an email to the teacher (once each). */
export const TEACHER_NOTIFIED_STATUSES = ["ready", "declined"] as const satisfies readonly RequestStatus[];

/** from → the statuses it may legally move to. */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ["in_progress", "ordered", "ready", "declined"],
  in_progress: ["ordered", "ready", "declined", "new"],
  ordered: ["ready", "declined", "in_progress"],
  ready: [],
  declined: ["new"],
};

export function isRequestStatus(v: unknown): v is RequestStatus {
  return typeof v === "string" && (REQUEST_STATUSES as readonly string[]).includes(v);
}

/** A no-op (from === to) is always allowed — it changes nothing. */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

const LABEL: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  ordered: "Ordered",
  ready: "Ready",
  declined: "Declined",
};

/**
 * null when the move is legal, otherwise a sentence an admin can act on.
 * Kept human — this string goes straight into the panel's error banner.
 */
export function transitionError(from: RequestStatus, to: RequestStatus): string | null {
  if (canTransition(from, to)) return null;
  if (from === "ready") {
    return `“${LABEL[from]}” is final — the teacher has already been told the book is waiting for them. Create a new request instead.`;
  }
  if (from === "declined") {
    return `A declined request can only be reopened as “${LABEL.new}”, not moved straight to “${LABEL[to]}”.`;
  }
  const options = ALLOWED_TRANSITIONS[from].map((s) => `“${LABEL[s]}”`).join(", ");
  return `Can't move a request from “${LABEL[from]}” to “${LABEL[to]}”. Allowed from here: ${options}.`;
}

/**
 * Does this transition warrant an email to the teacher? Only the first arrival
 * at ready/declined does — `notified` is the last status we emailed about, so a
 * declined → new → declined round trip stays quiet the second time.
 */
export function shouldNotifyTeacher(
  from: RequestStatus,
  to: RequestStatus,
  notified: string | null | undefined
): boolean {
  if (from === to) return false;
  if (!(TEACHER_NOTIFIED_STATUSES as readonly string[]).includes(to)) return false;
  return notified !== to;
}

/** Landing back on `new` re-arms the 72h reminder that had been fired off. */
export function clearsReminder(to: RequestStatus): boolean {
  return to === "new";
}
