import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  REQUEST_STATUSES,
  canTransition,
  clearsReminder,
  isRequestStatus,
  shouldNotifyTeacher,
  transitionError,
  type RequestStatus,
} from "./request-status";

describe("isRequestStatus", () => {
  it("accepts every declared status", () => {
    for (const s of REQUEST_STATUSES) expect(isRequestStatus(s)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRequestStatus("shipped")).toBe(false);
    expect(isRequestStatus("")).toBe(false);
    expect(isRequestStatus(null)).toBe(false);
    expect(isRequestStatus(3)).toBe(false);
  });
});

describe("canTransition", () => {
  it("new can move anywhere forward, including straight to a final state", () => {
    expect(canTransition("new", "in_progress")).toBe(true);
    expect(canTransition("new", "ordered")).toBe(true);
    expect(canTransition("new", "ready")).toBe(true);
    expect(canTransition("new", "declined")).toBe(true);
  });

  it("in_progress may go forward or back to new", () => {
    expect(canTransition("in_progress", "ordered")).toBe(true);
    expect(canTransition("in_progress", "ready")).toBe(true);
    expect(canTransition("in_progress", "declined")).toBe(true);
    expect(canTransition("in_progress", "new")).toBe(true);
  });

  it("ordered may step back only as far as in_progress", () => {
    expect(canTransition("ordered", "in_progress")).toBe(true);
    expect(canTransition("ordered", "new")).toBe(false);
  });

  it("ready is terminal — the teacher has already been told", () => {
    for (const s of REQUEST_STATUSES) {
      if (s === "ready") continue;
      expect(canTransition("ready", s)).toBe(false);
    }
  });

  it("declined can only be reopened as new", () => {
    expect(canTransition("declined", "new")).toBe(true);
    expect(canTransition("declined", "in_progress")).toBe(false);
    expect(canTransition("declined", "ordered")).toBe(false);
    expect(canTransition("declined", "ready")).toBe(false);
  });

  it("a no-op is always allowed", () => {
    for (const s of REQUEST_STATUSES) expect(canTransition(s, s)).toBe(true);
  });

  it("agrees with the map it is derived from", () => {
    for (const from of REQUEST_STATUSES) {
      for (const to of REQUEST_STATUSES) {
        if (from === to) continue;
        expect(canTransition(from, to)).toBe(ALLOWED_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("has no self-loops in the map (they're handled as no-ops)", () => {
    for (const from of REQUEST_STATUSES) {
      expect(ALLOWED_TRANSITIONS[from]).not.toContain(from);
    }
  });
});

describe("transitionError", () => {
  it("is null for every legal move", () => {
    for (const from of REQUEST_STATUSES) {
      for (const to of [...ALLOWED_TRANSITIONS[from], from]) {
        expect(transitionError(from, to as RequestStatus)).toBeNull();
      }
    }
  });

  it("explains why Ready can't be walked back", () => {
    expect(transitionError("ready", "new")).toMatch(/final/i);
  });

  it("points a declined request at the reopen path", () => {
    expect(transitionError("declined", "ordered")).toMatch(/reopened/i);
  });

  it("lists the legal alternatives for an ordinary bad move", () => {
    const msg = transitionError("ordered", "new") ?? "";
    expect(msg).toMatch(/Ready/);
    expect(msg).toMatch(/In progress/);
  });
});

describe("shouldNotifyTeacher", () => {
  it("emails on first arrival at ready or declined", () => {
    expect(shouldNotifyTeacher("ordered", "ready", null)).toBe(true);
    expect(shouldNotifyTeacher("new", "declined", null)).toBe(true);
  });

  it("stays quiet for working statuses", () => {
    expect(shouldNotifyTeacher("new", "in_progress", null)).toBe(false);
    expect(shouldNotifyTeacher("in_progress", "ordered", null)).toBe(false);
    expect(shouldNotifyTeacher("declined", "new", "declined")).toBe(false);
  });

  it("does not double-email on declined → new → declined", () => {
    expect(shouldNotifyTeacher("new", "declined", "declined")).toBe(false);
  });

  it("still emails when the outcome is a different one than last time", () => {
    expect(shouldNotifyTeacher("in_progress", "ready", "declined")).toBe(true);
  });

  it("never fires on a no-op", () => {
    expect(shouldNotifyTeacher("ready", "ready", null)).toBe(false);
  });
});

describe("clearsReminder", () => {
  it("re-arms the 72h chase-up only when landing back on new", () => {
    expect(clearsReminder("new")).toBe(true);
    for (const s of REQUEST_STATUSES) {
      if (s !== "new") expect(clearsReminder(s)).toBe(false);
    }
  });
});
