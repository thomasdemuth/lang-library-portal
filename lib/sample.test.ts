import { describe, expect, it } from "vitest";
import { sampleIds } from "./sample";

describe("sampleIds", () => {
  it("returns `count` distinct ids on a large range", () => {
    const ids = sampleIds(1, 10000, 60);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids.every((n) => n >= 1 && n <= 10000)).toBe(true);
  });

  it("caps at the range size (regression: infinite loop on small catalogs)", () => {
    // span of 5 can never yield 60 distinct ids — must return all 5, not hang
    const ids = sampleIds(3, 7, 60);
    expect(ids.sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
  });

  it("handles a single-id range", () => {
    expect(sampleIds(42, 42, 60)).toEqual([42]);
  });

  it("returns empty for an inverted or zero range", () => {
    expect(sampleIds(10, 1, 60)).toEqual([]);
    expect(sampleIds(5, 5, 0)).toEqual([]);
  });
});
