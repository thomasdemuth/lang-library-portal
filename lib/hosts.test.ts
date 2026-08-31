import { describe, expect, it } from "vitest";
import { emailAllowedFor } from "./hosts";

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
