import { describe, expect, it } from "vitest";
import { classifyEmail } from "./gate";

describe("classifyEmail", () => {
  it("student-domain email → student portal", () => {
    expect(classifyEmail("kid@students.thelangschool.org")).toEqual({
      kind: "portal",
      aud: "student",
      email: "kid@students.thelangschool.org",
    });
  });

  it("staff-domain email → staff portal", () => {
    expect(classifyEmail("teacher@thelangschool.org")).toEqual({
      kind: "portal",
      aud: "staff",
      email: "teacher@thelangschool.org",
    });
  });

  it("no student-domain address is special — every one lands in the student portal", () => {
    // The old librarian-developer exemption is gone: management is reached
    // only through /admin/login, whatever the Google account.
    expect(classifyEmail("thomas.demuth@students.thelangschool.org")).toEqual({
      kind: "portal",
      aud: "student",
      email: "thomas.demuth@students.thelangschool.org",
    });
  });

  it("off-domain email → reject", () => {
    const r = classifyEmail("someone@gmail.com");
    expect(r.kind).toBe("reject");
  });

  it("lowercases and trims", () => {
    expect(classifyEmail("  Kid@Students.TheLangSchool.org ")).toEqual({
      kind: "portal",
      aud: "student",
      email: "kid@students.thelangschool.org",
    });
  });
});
