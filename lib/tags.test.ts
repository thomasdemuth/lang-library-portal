import { describe, expect, it } from "vitest";
import { hidesTeacherBooks } from "./tags";

describe("hidesTeacherBooks", () => {
  it("hides them from students and from signed-out guests", () => {
    expect(hidesTeacherBooks("student")).toBe(true);
    expect(hidesTeacherBooks("guest")).toBe(true);
  });
  it("shows them to teachers and management", () => {
    expect(hidesTeacherBooks("staff")).toBe(false);
    expect(hidesTeacherBooks("admin")).toBe(false);
  });
  it("hides them when the audience is unknown", () => {
    // Fail closed: an un-audienced caller is not a reason to leak the shelf.
    expect(hidesTeacherBooks(undefined)).toBe(true);
  });
});
