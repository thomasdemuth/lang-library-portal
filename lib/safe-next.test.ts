import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps a normal same-site path", () => {
    expect(safeNextPath("/admin/inventory", "/admin")).toBe("/admin/inventory");
    expect(safeNextPath("/search?q=cats", "/")).toBe("/search?q=cats");
  });

  it("falls back when next is missing", () => {
    expect(safeNextPath(null, "/admin")).toBe("/admin");
    expect(safeNextPath("", "/")).toBe("/");
  });

  it("rejects protocol-relative and backslash off-site targets (open-redirect regression)", () => {
    expect(safeNextPath("//evil.example", "/admin")).toBe("/admin");
    expect(safeNextPath("/\\evil.example", "/admin")).toBe("/admin");
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
    expect(safeNextPath("javascript:alert(1)", "/")).toBe("/");
  });
});
