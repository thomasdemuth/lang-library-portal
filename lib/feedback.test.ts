import { describe, expect, it } from "vitest";
import { allChipsFor, bucketFor, chipsFor, MAX_TAGS, validTags } from "./feedback";

describe("bucketFor", () => {
  it("splits 1-2 / 3 / 4-5", () => {
    expect(bucketFor(1)).toBe("low");
    expect(bucketFor(2)).toBe("low");
    expect(bucketFor(3)).toBe("mid");
    expect(bucketFor(4)).toBe("high");
    expect(bucketFor(5)).toBe("high");
  });
});

describe("chipsFor", () => {
  it("offers a different set for a bad rating than a good one", () => {
    const bad = chipsFor("website", 1);
    const good = chipsFor("website", 5);
    expect(bad.length).toBeGreaterThan(0);
    expect(good.length).toBeGreaterThan(0);
    expect(bad.some((c) => good.includes(c))).toBe(false);
  });
  it("asks about the room, not the site, for the library topic", () => {
    expect(chipsFor("library", 5)).toContain("Comfy to sit");
    expect(chipsFor("website", 5)).not.toContain("Comfy to sit");
  });
  it("returns nothing for a rating outside 1-5", () => {
    expect(chipsFor("website", 0)).toEqual([]);
    expect(chipsFor("website", 6)).toEqual([]);
    expect(chipsFor("website", 2.5)).toEqual([]);
  });
});

describe("validTags", () => {
  it("keeps chips the topic offers, in order", () => {
    expect(validTags("website", ["Fast", "Looks great"])).toEqual(["Fast", "Looks great"]);
  });
  it("accepts chips from any bucket (the rating may have been changed)", () => {
    expect(validTags("website", ["Fast", "Confusing"])).toEqual(["Fast", "Confusing"]);
  });
  it("drops forged, cross-topic, duplicate, and non-string entries", () => {
    expect(validTags("website", ["Comfy to sit"])).toEqual([]); // library-only chip
    expect(validTags("website", ["<script>alert(1)</script>"])).toEqual([]);
    expect(validTags("website", ["Fast", "Fast"])).toEqual(["Fast"]);
    expect(validTags("website", [42, null, "Fast"])).toEqual(["Fast"]);
  });
  it("caps the count and tolerates a non-array", () => {
    expect(validTags("library", allChipsFor("library")).length).toBe(MAX_TAGS);
    expect(validTags("website", "Fast")).toEqual([]);
    expect(validTags("website", undefined)).toEqual([]);
  });
});
