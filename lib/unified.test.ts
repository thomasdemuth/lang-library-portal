import { describe, expect, it } from "vitest";
import { homePathFor, portalIdForEmail, splitPortalPath, treeFor } from "./unified";

describe("portalIdForEmail", () => {
  it("slugs the email local part", () => {
    expect(portalIdForEmail("kid.tester@students.thelangschool.org")).toBe("kid-tester");
    expect(portalIdForEmail("jane.doe@thelangschool.org")).toBe("jane-doe");
  });
  it("lowercases and collapses symbols", () => {
    expect(portalIdForEmail("Jane_Q.Doe+lib@thelangschool.org")).toBe("jane-q-doe-lib");
  });
  it("never returns an empty id", () => {
    expect(portalIdForEmail("...@thelangschool.org")).toBe("me");
  });
  it("is stable for the same email", () => {
    const a = portalIdForEmail("sam.reader@students.thelangschool.org");
    expect(portalIdForEmail("Sam.Reader@students.thelangschool.org")).toBe(a);
  });
});

describe("homePathFor", () => {
  it("routes students to /student/<id>", () => {
    expect(homePathFor({ aud: "student", email: "kid.tester@students.thelangschool.org" })).toBe(
      "/student/kid-tester"
    );
  });
  it("routes staff and admins to /staff/<id>", () => {
    expect(homePathFor({ aud: "staff", email: "jane.doe@thelangschool.org" })).toBe("/staff/jane-doe");
    expect(homePathFor({ aud: "admin", email: "lib.rarian@thelangschool.org" })).toBe("/staff/lib-rarian");
  });
});

describe("splitPortalPath", () => {
  it("parses portal homes and sub-paths", () => {
    expect(splitPortalPath("/student/kid-tester")).toEqual({ tree: "student", id: "kid-tester", rest: "" });
    expect(splitPortalPath("/staff/jane-doe/search")).toEqual({ tree: "staff", id: "jane-doe", rest: "/search" });
  });
  it("ignores non-portal paths", () => {
    expect(splitPortalPath("/")).toBeNull();
    expect(splitPortalPath("/student")).toBeNull();
    expect(splitPortalPath("/students/abc")).toBeNull(); // public student profiles ≠ portal tree
    expect(splitPortalPath("/admin/inventory")).toBeNull();
  });
});

describe("treeFor", () => {
  it("admin sessions live in the staff tree", () => {
    expect(treeFor({ aud: "admin", email: "a@thelangschool.org" })).toBe("staff");
    expect(treeFor({ aud: "staff", email: "a@thelangschool.org" })).toBe("staff");
    expect(treeFor({ aud: "student", email: "a@students.thelangschool.org" })).toBe("student");
  });
});
