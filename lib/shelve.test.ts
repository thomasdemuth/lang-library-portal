import { describe, expect, it } from "vitest";
import { inRange, parseRange, resolveShelf, surnameKey, type ShelfInfo } from "./shelve";

describe("surnameKey", () => {
  it("handles Last, First", () => expect(surnameKey("Kinney, Jeff")).toBe("KINNEY"));
  it("handles First Last", () => expect(surnameKey("Jeff Kinney")).toBe("KINNEY"));
  it("uses the first author", () => expect(surnameKey("Gross, Ruth Belov; McCully, Emily Arnold")).toBe("GROSS"));
  it("strips accents and punctuation", () => expect(surnameKey("Mélina O'Mangal")).toBe("OMANGAL"));
  it("skips suffixes", () => expect(surnameKey("Martin Luther King Jr.")).toBe("KING"));
  it("returns null for empty", () => expect(surnameKey(null)).toBeNull());
});

describe("parseRange / inRange", () => {
  it("parses en-dash letter ranges", () => expect(parseRange("AA–CZ")).toEqual(["AA", "CZ"]));
  it("parses hyphen and spaces", () => expect(parseRange(" a - z ")).toEqual(["A", "Z"]));
  it("rejects rangeless text", () => expect(parseRange("Picture books")).toBeNull());
  it("matches inside", () => expect(inRange("KINNEY", "KA", "LZ")).toBe(true));
  it("matches single-letter spans", () => expect(inRange("KINNEY", "A", "Z")).toBe(true));
  it("rejects outside", () => expect(inRange("KINNEY", "MA", "ZZ")).toBe(false));
  it("boundary is inclusive", () => expect(inRange("KINNEY", "KI", "KI")).toBe(true));
});

const shelves: ShelfInfo[] = [
  { id: "1", label: "Fiction A", category: "fiction", letter_range: "AA–JZ", shelf_number: "01" },
  { id: "2", label: "Fiction B", category: "fiction", letter_range: "KA–ZZ", shelf_number: "02" },
  { id: "3", label: "Comics", category: "comics", letter_range: null, shelf_number: "03" },
  { id: "4", label: "Non-Fiction", category: "nonfiction", letter_range: "000–999", shelf_number: "04" },
];

describe("resolveShelf", () => {
  it("narrows fiction by author range", () => {
    const m = resolveShelf("fiction", "Kinney, Jeff", shelves);
    expect(m.ranged).toBe(true);
    expect(m.shelves.map((s) => s.id)).toEqual(["2"]);
  });
  it("falls back to category when no range matches", () => {
    const m = resolveShelf("comics", "Kinney, Jeff", shelves);
    expect(m.ranged).toBe(false);
    expect(m.shelves.map((s) => s.id)).toEqual(["3"]);
  });
  it("returns all category shelves when author is unknown", () => {
    const m = resolveShelf("fiction", null, shelves);
    expect(m.ranged).toBe(false);
    expect(m.shelves).toHaveLength(2);
  });
  it("numeric ranges don't swallow surname keys", () => {
    const m = resolveShelf("nonfiction", "Kinney, Jeff", shelves);
    expect(m.ranged).toBe(false);
    expect(m.shelves.map((s) => s.id)).toEqual(["4"]);
  });
  it("empty when the category has no shelves", () => {
    expect(resolveShelf("drama", "Anyone", shelves).shelves).toHaveLength(0);
  });
  it("reads ranges out of shelf labels when the range field is empty", () => {
    const young: ShelfInfo[] = [
      { id: "a", label: "A-E", category: "young", letter_range: null, shelf_number: "05" },
      { id: "b", label: "F-M", category: "young", letter_range: null, shelf_number: "04" },
      { id: "c", label: "S-Z", category: "young", letter_range: "I Can Read", shelf_number: "02" },
    ];
    const m = resolveShelf("young", "Willems, Mo", young);
    expect(m.ranged).toBe(true);
    expect(m.shelves.map((s) => s.id)).toEqual(["c"]);
  });
});
