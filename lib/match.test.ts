import { describe, expect, it } from "vitest";
import {
  chooseMatch,
  mergeBooks,
  normalizeTitle,
  rowToBook,
  similarity,
  stripSubtitle,
  type Candidate,
} from "./match";

function cand(
  id: number,
  title: string,
  creators: string | null,
  copies: number
): Candidate {
  return {
    id,
    title,
    creators,
    copies,
    title_norm: normalizeTitle(title),
    creators_norm: creators ? normalizeTitle(creators) : null,
  };
}

const POOL: Candidate[] = [
  cand(1, "Charlotte's Web", "White, E. B.", 6),
  cand(2, "The Giver", "Lowry, Lois", 3),
  cand(3, "Harry Potter and the Sorcerer's Stone", "Rowling, J.K.", 2),
  cand(4, "Nate The Great And The Lost List", "Sharmat, Marjorie W.", 1),
  cand(5, "Holes", "Sachar, Louis", 12),
  cand(6, "Guide to South Korea", "Michael March", 1),
];

describe("normalization", () => {
  it("strips punctuation, case, diacritics, leading articles", () => {
    expect(normalizeTitle("The Giver")).toBe("giver");
    expect(normalizeTitle("Charlotte's Web")).toBe("charlottes web");
    expect(normalizeTitle("  Éloge de l'ombre! ")).toBe("eloge de lombre");
  });
  it("strips subtitles from raw titles", () => {
    expect(stripSubtitle("Harry Potter and the Sorcerer's Stone: Special Edition")).toBe(
      "Harry Potter and the Sorcerer's Stone"
    );
    expect(stripSubtitle("Frog and Toad - The Complete Collection")).toBe("Frog and Toad");
  });
  it("similarity is 1 for identical, ~0 for unrelated", () => {
    expect(similarity("charlottes web", "charlottes web")).toBe(1);
    expect(similarity("charlottes web", "quantum physics")).toBeLessThan(0.15);
  });
});

describe("chooseMatch", () => {
  it("finds an exact title with enough copies", () => {
    const r = chooseMatch({ title: "Charlotte's Web", author: "E.B. White", copies: 4 }, POOL);
    expect(r.status).toBe("found");
    expect(r.matched?.copies).toBe(6);
  });

  it("tags insufficient when copies are short, with the count", () => {
    const r = chooseMatch({ title: "The Giver", author: "Lois Lowry", copies: 10 }, POOL);
    expect(r.status).toBe("insufficient");
    expect(r.matched?.copies).toBe(3);
  });

  it("survives apostrophe and article differences", () => {
    const r = chooseMatch({ title: "charlottes web", copies: 1 }, POOL);
    expect(r.status).toBe("found");
    const r2 = chooseMatch({ title: "Giver", copies: 1 }, POOL);
    expect(r2.status).toBe("found");
  });

  it("matches a requested subtitle variant", () => {
    const r = chooseMatch(
      { title: "Harry Potter and the Sorcerer's Stone: Special Edition", copies: 1 },
      POOL
    );
    expect(r.status).toBe("found");
    expect(r.matched?.id).toBe(3);
  });

  it("rejects the same title by a different author (when author given)", () => {
    const r = chooseMatch({ title: "Holes", author: "Stephen King", copies: 1 }, POOL);
    expect(r.status).toBe("not_found");
    expect(r.candidates.length).toBeGreaterThan(0); // near-miss surfaced for admins
  });

  it("returns not_found for gibberish", () => {
    const r = chooseMatch({ title: "Zorbulon's Quantum Lawnmower", copies: 1 }, POOL);
    expect(r.status).toBe("not_found");
    expect(r.matched).toBeNull();
  });

  it("accepts a fuzzy title when no author is given", () => {
    const r = chooseMatch({ title: "Nate the Great and the lost list", copies: 1 }, POOL);
    expect(r.status).toBe("found");
    expect(r.matched?.id).toBe(4);
  });
});

describe("CSV rows", () => {
  it("maps Libib headers and defaults copies to 1", () => {
    const b = rowToBook({
      item_type: "book",
      title: "Guide to South Korea",
      creators: "Michael March",
      ean_isbn13: "9780875349244",
      upc_isbn10: "0875349242",
      publisher: "Highlights for Children",
      copies: "",
    });
    expect(b?.isbn13).toBe("9780875349244");
    expect(b?.copies).toBe(1);
    expect(b?.dedupe_key).toBe("i13:9780875349244");
  });

  it("skips rows without titles", () => {
    expect(rowToBook({ title: "  " })).toBeNull();
  });

  it("merges duplicate ISBNs by summing copies", () => {
    const rows = [
      rowToBook({ title: "Holes", ean_isbn13: "9780440414803", copies: "2" })!,
      rowToBook({ title: "HOLES", ean_isbn13: "978-0-440-41480-3", copies: "3" })!,
      rowToBook({ title: "Holes", copies: "1" })!, // no ISBN → separate title/author key
    ];
    const merged = mergeBooks(rows);
    const byIsbn = merged.find((m) => m.dedupe_key === "i13:9780440414803");
    expect(byIsbn?.copies).toBe(5);
    expect(merged.length).toBe(2);
  });

  it("falls back through isbn10 to title+author keys", () => {
    const b = rowToBook({ title: "Old Book", upc_isbn10: "0875349242" });
    expect(b?.dedupe_key).toBe("i10:0875349242");
    const c = rowToBook({ title: "No ISBN Book", creators: "Someone" });
    expect(c?.dedupe_key).toBe("ta:no isbn book|someone");
  });
});
