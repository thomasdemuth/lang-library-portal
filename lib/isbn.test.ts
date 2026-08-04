import { describe, expect, it } from "vitest";
import {
  isValidIsbn10,
  isValidIsbn13,
  isbn10to13,
  isbn13to10,
  isbnCandidates,
  normalizeIsbn,
  upcAToEan13,
} from "./isbn";

describe("checksum validation", () => {
  it("accepts valid ISBN-10s, including an X check digit", () => {
    expect(isValidIsbn10("0306406152")).toBe(true);
    expect(isValidIsbn10("043935806X")).toBe(true);
    expect(isValidIsbn10("043935806x")).toBe(true);
    expect(isValidIsbn10("0-306-40615-2")).toBe(true);
  });

  it("rejects ISBN-10s with a bad checksum, bad length, or a stray X", () => {
    expect(isValidIsbn10("0306406153")).toBe(false);
    expect(isValidIsbn10("0439358069")).toBe(false);
    expect(isValidIsbn10("030640615")).toBe(false);
    expect(isValidIsbn10("04X935806X")).toBe(false);
  });

  it("accepts valid ISBN-13s and rejects bad checksums", () => {
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
    expect(isValidIsbn13("9780306406158")).toBe(false);
    expect(isValidIsbn13("978030640615")).toBe(false);
  });

  it("rejects an X anywhere in an ISBN-13 (13-digit codes are all digits)", () => {
    expect(isValidIsbn13("978030640615X")).toBe(false);
  });
});

describe("isbn10to13", () => {
  it("prefixes 978 and recomputes the check digit", () => {
    expect(isbn10to13("0306406152")).toBe("9780306406157");
    expect(isbn10to13("043935806X")).toBe("9780439358064");
  });

  it("tolerates hyphens and lowercase x", () => {
    expect(isbn10to13("0-439-35806-x")).toBe("9780439358064");
  });

  it("refuses anything that isn't a checksum-valid ISBN-10", () => {
    expect(isbn10to13("0306406153")).toBeNull();
    expect(isbn10to13("9780306406157")).toBeNull();
    expect(isbn10to13("")).toBeNull();
  });
});

describe("isbn13to10", () => {
  it("strips the 978 prefix and recomputes the check digit", () => {
    expect(isbn13to10("9780306406157")).toBe("0306406152");
    expect(isbn13to10("9780439358064")).toBe("043935806X");
  });

  it("returns null for the 979 block, which has no ISBN-10 form", () => {
    expect(isValidIsbn13("9798886451740")).toBe(true);
    expect(isbn13to10("9798886451740")).toBeNull();
    expect(isbn13to10("9791234567896")).toBeNull();
  });

  it("refuses bad checksums and non-13-digit input", () => {
    expect(isbn13to10("9780306406158")).toBeNull();
    expect(isbn13to10("0306406152")).toBeNull();
  });
});

describe("round trips", () => {
  it("10 → 13 → 10 is stable", () => {
    for (const i10 of ["0306406152", "043935806X", "0140449132", "1861972717"]) {
      expect(isbn13to10(isbn10to13(i10)!)).toBe(i10);
    }
  });
});

describe("upcAToEan13", () => {
  it("zero-pads a valid UPC-A, whose check digit survives the pad", () => {
    expect(upcAToEan13("036000291452")).toBe("0036000291452");
  });

  it("returns null for a bad UPC-A checksum or the wrong length", () => {
    expect(upcAToEan13("036000291453")).toBeNull();
    expect(upcAToEan13("9780306406157")).toBeNull();
    expect(upcAToEan13("03600029145")).toBeNull();
  });
});

describe("normalizeIsbn", () => {
  it("returns both forms for a 978 ISBN-13", () => {
    expect(normalizeIsbn("9780306406157")).toEqual({
      isbn13: "9780306406157",
      isbn10: "0306406152",
    });
  });

  it("returns both forms for an ISBN-10", () => {
    expect(normalizeIsbn("043935806X")).toEqual({
      isbn13: "9780439358064",
      isbn10: "043935806X",
    });
  });

  it("returns only isbn13 for the 979 prefix", () => {
    expect(normalizeIsbn("9798886451740")).toEqual({ isbn13: "9798886451740" });
  });

  it("returns null for bad checksums", () => {
    expect(normalizeIsbn("9780306406158")).toBeNull();
    expect(normalizeIsbn("0306406153")).toBeNull();
  });

  it("returns null for a non-Bookland EAN-13 — a product barcode isn't a book", () => {
    expect(isValidIsbn13("0036000291452")).toBe(true);
    expect(normalizeIsbn("0036000291452")).toBeNull();
  });

  it("returns null for lengths that aren't 10 or 13", () => {
    expect(normalizeIsbn("036000291452")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });
});

describe("isbnCandidates", () => {
  it("covers both ISBN forms so an isbn10-only row still matches a scan", () => {
    expect(isbnCandidates("9780306406157").sort()).toEqual(
      ["0306406152", "9780306406157"].sort()
    );
    expect(isbnCandidates("0306406152").sort()).toEqual(
      ["0306406152", "9780306406157"].sort()
    );
  });

  it("pairs a UPC-A with its zero-padded EAN-13 in both directions", () => {
    expect(isbnCandidates("036000291452").sort()).toEqual(
      ["0036000291452", "036000291452"].sort()
    );
    expect(isbnCandidates("0036000291452").sort()).toEqual(
      ["0036000291452", "036000291452"].sort()
    );
  });

  it("falls back to the bare code when it isn't a valid ISBN", () => {
    expect(isbnCandidates("9780306406158")).toEqual(["9780306406158"]);
  });

  it("only ever emits [0-9X] — safe to embed in a PostgREST or() filter", () => {
    for (const c of isbnCandidates("978-0-306-40615-7, drop table")) {
      expect(c).toMatch(/^[0-9X]+$/);
    }
    expect(isbnCandidates("")).toEqual([]);
  });
});
