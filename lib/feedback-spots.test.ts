import { describe, expect, it } from "vitest";
import {
  LIBRARY_CODE,
  listSpots,
  normalizeCode,
  resolveSpot,
  SITE_CODE,
  slugify,
  spotSlug,
  type SpotShelf,
} from "./feedback-spots";

const shelves: SpotShelf[] = [
  { label: "Fiction A–C", category: "fiction", shelf_number: "04", sort: 1 },
  { label: "Comics", category: "comics", shelf_number: null, sort: 2 },
  { label: "Comics", category: "comics", shelf_number: null, sort: 3 }, // same name twice
  { label: "Games", category: "games", shelf_number: null, sort: 4 },
];

describe("slugify", () => {
  it("lowercases, strips punctuation and accents, and collapses gaps", () => {
    expect(slugify("Fiction A–C")).toBe("fiction-a-c");
    expect(slugify("  Muñoz Ryan  ")).toBe("munoz-ryan");
    expect(slugify("!!!")).toBe("");
  });
  it("keeps codes short, cutting at a word boundary", () => {
    const slug = slugify("Non-Fiction reference and periodicals annex");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("non-fiction-reference");
  });
});

describe("spotSlug", () => {
  it("puts the shelf number in front of the label", () => {
    expect(spotSlug(shelves[0])).toBe("04-fiction-a-c");
  });
  it("falls back to a usable code when the label has nothing sluggable", () => {
    expect(spotSlug({ label: "!!!", category: "other" })).toBe("zone");
  });
});

describe("listSpots", () => {
  it("always offers the website and the whole library, even with no shelves", () => {
    expect(listSpots([]).map((s) => s.code)).toEqual([SITE_CODE, LIBRARY_CODE]);
  });
  it("adds one spot per zone in map order and deduplicates repeated names", () => {
    expect(listSpots(shelves).map((s) => s.code)).toEqual([
      SITE_CODE,
      LIBRARY_CODE,
      "04-fiction-a-c",
      "comics",
      "comics-2",
      "games",
    ]);
  });
  it("carries the zone's map color and asks about the room", () => {
    const comics = listSpots(shelves).find((s) => s.code === "comics")!;
    expect(comics.color).toBe("#29AC9C");
    expect(comics.topic).toBe("library");
    expect(comics.heading).toBe("How's the Comics area?");
  });
  it("marks the website spot as being about the website", () => {
    expect(listSpots(shelves)[0].topic).toBe("website");
  });
});

describe("resolveSpot", () => {
  it("resolves a printed code back to its zone", () => {
    expect(resolveSpot("04-fiction-a-c", shelves).label).toBe("Fiction A–C");
    expect(resolveSpot("comics-2", shelves).known).toBe(true);
  });
  it("normalizes messy casing and stray characters from the URL", () => {
    expect(normalizeCode("04_Fiction%20A-C")).toBe("04-fiction-a-c");
    expect(resolveSpot("COMICS", shelves).label).toBe("Comics");
  });
  it("falls back to the library rather than 404ing on a stale poster", () => {
    const stale = resolveSpot("old-poetry-nook", shelves);
    expect(stale.known).toBe(false);
    expect(stale.topic).toBe("library");
    expect(stale.code).toBe("old-poetry-nook"); // still recorded for triage
  });
  it("treats an empty code as the library as a whole", () => {
    expect(resolveSpot("", shelves).code).toBe(LIBRARY_CODE);
  });
});
