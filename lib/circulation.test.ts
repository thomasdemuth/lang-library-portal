import { describe, expect, it } from "vitest";
import {
  daysLeft,
  daysOut,
  dueDate,
  dueLabel,
  isEmailMode,
  isOverdue,
  isSchoolEmail,
  LOAN_DAYS,
  outLabel,
} from "./circulation";

const T0 = new Date("2026-08-21T12:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 24 * 3600 * 1000).toISOString();

describe("dueDate", () => {
  it("adds the loan period", () => {
    expect(dueDate(T0).toISOString()).toBe(days(LOAN_DAYS));
  });
});

describe("daysLeft / isOverdue / dueLabel", () => {
  it("counts down and flips to overdue", () => {
    expect(daysLeft(days(5), T0)).toBe(5);
    expect(daysLeft(days(0), T0)).toBe(0);
    expect(daysLeft(days(-3), T0)).toBe(-3);
    expect(isOverdue(days(0), T0)).toBe(false);
    expect(isOverdue(days(-1), T0)).toBe(true);
  });
  it("words every phase", () => {
    expect(dueLabel(days(5), T0)).toBe("due in 5 days");
    expect(dueLabel(days(1), T0)).toBe("due tomorrow");
    expect(dueLabel(days(0), T0)).toBe("due today");
    expect(dueLabel(days(-1), T0)).toBe("1 day overdue");
    expect(dueLabel(days(-4), T0)).toBe("4 days overdue");
  });
  it("treats an unparseable date as due today rather than throwing", () => {
    expect(daysLeft("garbage", T0)).toBe(0);
    expect(dueLabel("garbage", T0)).toBe("due today");
  });
});

describe("daysOut / outLabel", () => {
  it("counts time since taken and never goes negative", () => {
    expect(daysOut(days(-12), T0)).toBe(12);
    expect(daysOut(days(1), T0)).toBe(0); // clock skew → 0, not -1
    expect(outLabel(days(0), T0)).toBe("today");
    expect(outLabel(days(-1), T0)).toBe("yesterday");
    expect(outLabel(days(-9), T0)).toBe("9 days ago");
  });
});

describe("isSchoolEmail", () => {
  it("accepts both school domains, case-insensitively", () => {
    expect(isSchoolEmail("kid.tester@students.thelangschool.org")).toBe(true);
    expect(isSchoolEmail("Jane.Doe@thelangschool.org")).toBe(true);
    expect(isSchoolEmail("  jane@thelangschool.org ")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isSchoolEmail("kid@gmail.com")).toBe(false);
    expect(isSchoolEmail("kid@fakestudents.thelangschool.org")).toBe(false);
    expect(isSchoolEmail("kid@thelangschool.org.evil.com")).toBe(false);
    expect(isSchoolEmail("@students.thelangschool.org")).toBe(false);
    expect(isSchoolEmail("")).toBe(false);
  });
});

describe("isEmailMode", () => {
  it("knows the three modes and nothing else", () => {
    expect(isEmailMode("per_checkout")).toBe(true);
    expect(isEmailMode("daily_digest")).toBe(true);
    expect(isEmailMode("off")).toBe(true);
    expect(isEmailMode("weekly")).toBe(false);
    expect(isEmailMode(null)).toBe(false);
  });
});
