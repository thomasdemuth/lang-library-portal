import { describe, expect, it } from "vitest";
import { acceptOlMatch, OL_TITLE_MIN, OL_TITLE_ONLY_MIN } from "./enrich-match";

/**
 * The nightly drip writes into the live catalog unattended, so these are the
 * rules that decide whether a title-only search result is allowed to become a
 * book's identity (ISBN) or just its blurb (description).
 */
describe("acceptOlMatch", () => {
  const holes = { title: "Holes", creators: "Sachar, Louis" };

  it("accepts both when the title and the author agree", () => {
    expect(acceptOlMatch(holes, { title: "Holes", author_name: ["Louis Sachar"] })).toEqual({
      isbn: true,
      description: true,
    });
  });

  it("tolerates edition noise in the title", () => {
    expect(
      acceptOlMatch(holes, { title: "Holes (Readers Circle)", author_name: ["Louis Sachar"] })
    ).toEqual({ isbn: true, description: true });
  });

  it("matches an author written the other way round", () => {
    expect(acceptOlMatch(holes, { title: "Holes", author_name: ["Sachar, Louis"] })).toEqual({
      isbn: true,
      description: true,
    });
  });

  it("refuses a different book by a different author", () => {
    expect(acceptOlMatch(holes, { title: "Holes", author_name: ["Ted Dekker"] })).toEqual({
      isbn: false,
      description: false,
    });
  });

  it("refuses a near-miss title outright", () => {
    expect(
      acceptOlMatch({ title: "The Giver", creators: "Lowry, Lois" }, { title: "The River", author_name: ["Lois Lowry"] })
    ).toEqual({ isbn: false, description: false });
  });

  it("never writes an ISBN for a book with no author on file", () => {
    // The "Life" case: sixteen catalog rows, no author, one title search.
    const life = { title: "Life", creators: null };
    expect(acceptOlMatch(life, { title: "Life", author_name: ["Keith Richards"], isbn: ["9780316034418"] })).toEqual({
      isbn: false,
      description: true, // identical title clears the title-only bar
    });
    expect(acceptOlMatch(life, { title: "Life: A User's Manual", author_name: ["Georges Perec"] })).toEqual({
      isbn: false,
      description: false,
    });
  });

  it("never writes an ISBN when the hit lists no author", () => {
    expect(acceptOlMatch(holes, { title: "Holes" })).toEqual({ isbn: false, description: true });
    expect(acceptOlMatch(holes, { title: "Holes (Readers Circle)" })).toEqual({
      isbn: false,
      description: false, // close, but nothing corroborates it
    });
  });

  it("refuses an empty or missing hit", () => {
    expect(acceptOlMatch(holes, null)).toEqual({ isbn: false, description: false });
    expect(acceptOlMatch(holes, {})).toEqual({ isbn: false, description: false });
    expect(acceptOlMatch(holes, { title: "" })).toEqual({ isbn: false, description: false });
  });

  it("keeps the description bar at or above the ISBN bar", () => {
    expect(OL_TITLE_ONLY_MIN).toBeGreaterThanOrEqual(OL_TITLE_MIN);
  });
});
