import { describe, expect, it } from "vitest";
import { emailAllowedFor, isManagementExemptEmail } from "./hosts";

describe("emailAllowedFor", () => {
  it("gates the student site to the student subdomain", () => {
    expect(emailAllowedFor("student", "kid@students.thelangschool.org")).toBe(true);
    expect(emailAllowedFor("student", "teacher@thelangschool.org")).toBe(false);
  });
  it("gates the staff site to the staff domain, never the student subdomain", () => {
    expect(emailAllowedFor("staff", "teacher@thelangschool.org")).toBe(true);
    expect(emailAllowedFor("staff", "kid@students.thelangschool.org")).toBe(false);
    expect(emailAllowedFor("staff", "someone@gmail.com")).toBe(false);
  });
});

describe("isManagementExemptEmail", () => {
  it("exempts the one student-domain management address (case/space-insensitive)", () => {
    expect(isManagementExemptEmail("thomas.demuth@students.thelangschool.org")).toBe(true);
    expect(isManagementExemptEmail("  Thomas.Demuth@Students.TheLangSchool.org ")).toBe(true);
  });
  it("does not exempt ordinary student or staff emails", () => {
    expect(isManagementExemptEmail("kid@students.thelangschool.org")).toBe(false);
    expect(isManagementExemptEmail("teacher@thelangschool.org")).toBe(false);
  });
});
