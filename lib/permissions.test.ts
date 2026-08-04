import { describe, expect, it } from "vitest";
import { canDo, cleanPermissions, isDeveloper } from "./permissions";

describe("canDo (import gate)", () => {
  it("chief admins implicitly hold every power, including inventory_import", () => {
    expect(canDo({ role: "chief" }, "inventory_import")).toBe(true);
    expect(canDo({ role: "chief", permissions: {} }, "inventory_import")).toBe(true);
  });

  it("a regular admin can import only when the power was granted", () => {
    expect(canDo({ role: "admin", permissions: { inventory_import: true } }, "inventory_import")).toBe(true);
    expect(canDo({ role: "admin", permissions: { inventory_view: true } }, "inventory_import")).toBe(false);
    expect(canDo({ role: "admin", permissions: {} }, "inventory_import")).toBe(false);
    expect(canDo({ role: "admin", permissions: null }, "inventory_import")).toBe(false);
  });

  it("inventory_import survives permission sanitization", () => {
    expect(cleanPermissions({ inventory_import: true, bogus: true })).toEqual({ inventory_import: true });
    expect(cleanPermissions({ inventory_import: "yes" })).toEqual({});
  });
});

describe("isDeveloper", () => {
  it("recognises both developer addresses, case-insensitively", () => {
    expect(isDeveloper("thomas.demuth@thelangschool.org")).toBe(true);
    expect(isDeveloper("Thomas.DeMuth@students.thelangschool.org")).toBe(true);
  });

  it("everyone else is not the developer (import no longer depends on this)", () => {
    expect(isDeveloper("librarian@thelangschool.org")).toBe(false);
    expect(isDeveloper(null)).toBe(false);
    expect(isDeveloper(undefined)).toBe(false);
  });
});
