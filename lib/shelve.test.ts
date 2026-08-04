import { describe, expect, it } from "vitest";
import { authorSortKey, inRange, parseRange, resolveShelf, surnameKey, surnameOf, type ShelfInfo } from "./shelve";

describe("surnameKey", () => {
  it("handles Last, First", () => expect(surnameKey("Kinney, Jeff")).toBe("KINNEY"));
  it("handles First Last", () => expect(surnameKey("Jeff Kinney")).toBe("KINNEY"));
  it("uses the first author", () => expect(surnameKey("Gross, Ruth Belov; McCully, Emily Arnold")).toBe("GROSS"));
  it("strips accents and punctuation", () => expect(surnameKey("Mélina O'Mangal")).toBe("OMANGAL"));
  it("skips suffixes", () => expect(surnameKey("Martin Luther King Jr.")).toBe("KING"));
  it("returns null for empty", () => expect(surnameKey(null)).toBeNull());
});

describe("surnameOf", () => {
  it("keeps the surname as written", () => {
    expect(surnameOf("O'Dell, Scott")).toBe("O'Dell");
    expect(surnameOf("Scott O'Dell")).toBe("O'Dell");
    expect(surnameOf("Muñoz Ryan, Pam")).toBe("Muñoz Ryan");
    expect(surnameOf("Gabriel García Márquez")).toBe("Márquez");
  });
  it("uses the first author and skips suffixes", () => {
    expect(surnameOf("Gross, Ruth Belov; McCully, Emily Arnold")).toBe("Gross");
    expect(surnameOf("Martin Luther King Jr.")).toBe("King");
  });
  it("returns null for empty", () => {
    expect(surnameOf(null)).toBeNull();
    expect(surnameOf("   ")).toBeNull();
  });
});

describe("authorSortKey", () => {
  it("puts the surname first for both name formats", () => {
    expect(authorSortKey("Jeff Kinney")).toBe("kinney jeff kinney");
    expect(authorSortKey("Kinney, Jeff")).toBe("kinney kinney jeff");
  });
  it("sorts two authors by the first one's surname", () => {
    const a = authorSortKey("Beverly Cleary");
    const b = authorSortKey("Ruth Belov Gross, Emily Arnold McCully");
    expect(a && b && a < b).toBe(true); // Cleary before Gross
  });
  it("returns null when there's no author", () => expect(authorSortKey(null)).toBeNull());
});

describe("parseRange / inRange", () => {
  it("parses en-dash letter ranges", () => expect(parseRange("AA–CZ")).toEqual(["AA", "CZ"]));
  it("parses hyphen and spaces", () => expect(parseRange(" a - z ")).toEqual(["A", "Z"]));
  it("parses mixed-case two-letter spans", () => expect(parseRange("Aa-Mz")).toEqual(["AA", "MZ"]));
  it("parses numeric spans", () => {
    expect(parseRange("000–999")).toEqual(["000", "999"]);
    expect(parseRange("500-599")).toEqual(["500", "599"]);
  });
  it("rejects rangeless text", () => expect(parseRange("Picture books")).toBeNull());
  it("rejects hyphenated names that aren't ranges", () => {
    // "Easy-Readers" used to parse as EASY→READERS, a span wide enough to
    // swallow most surnames (KINNEY sits inside it).
    expect(parseRange("Easy-Readers")).toBeNull();
    expect(parseRange("Non-Fiction")).toBeNull();
    expect(parseRange("Picture-Books")).toBeNull();
  });
  it("rejects half-letter/half-number spans", () => expect(parseRange("A-999")).toBeNull());
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
  it("does not read a hyphenated shelf name as a letter range", () => {
    const young: ShelfInfo[] = [
      { id: "e", label: "Easy-Readers", category: "young", letter_range: null, shelf_number: "01" },
      { id: "f", label: "Chapter Books", category: "young", letter_range: null, shelf_number: "02" },
    ];
    const m = resolveShelf("young", "Kinney, Jeff", young);
    expect(m.ranged).toBe(false); // EASY→READERS is not a range
    expect(m.shelves.map((s) => s.id)).toEqual(["e", "f"]);
  });
  it("keeps a reverse-ordered name like Non-Fiction out of the ranges", () => {
    const m = resolveShelf("nonfiction", "Adams, Ansel", [
      { id: "n", label: "Non-Fiction", category: "nonfiction", letter_range: null, shelf_number: "04" },
    ]);
    expect(m.ranged).toBe(false);
    expect(m.shelves.map((s) => s.id)).toEqual(["n"]);
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
