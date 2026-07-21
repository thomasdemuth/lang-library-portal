import { describe, expect, it } from "vitest";
import {
  GAME_SUBCATEGORY_IDS,
  isGameSubcategory,
  normalizeGameTitle,
  toSubcategory,
} from "./games";
import { CATEGORY_IDS, MAP_CATEGORY_IDS, GAMES_COLOR, MAP_CATEGORIES } from "./categories";

describe("game sub-categories", () => {
  it("lists the four sub-categories in display order", () => {
    expect(GAME_SUBCATEGORY_IDS).toEqual(["card", "board", "word", "other"]);
  });

  it("recognizes valid sub-categories", () => {
    expect(isGameSubcategory("board")).toBe(true);
    expect(isGameSubcategory("comics")).toBe(false); // a book tag, not a game sub-cat
    expect(isGameSubcategory(null)).toBe(false);
  });

  it("defaults anything invalid to 'other'", () => {
    expect(toSubcategory("word")).toBe("word");
    expect(toSubcategory("nonsense")).toBe("other");
    expect(toSubcategory(undefined)).toBe("other");
  });

  it("normalizes titles the same way book titles are normalized", () => {
    expect(normalizeGameTitle("  Uno®! ")).toBe("uno");
    expect(normalizeGameTitle("Ticket to Ride")).toBe("ticket to ride");
  });
});

describe("games vs book category separation", () => {
  it("keeps 'games' out of the book tag categories", () => {
    expect(CATEGORY_IDS).not.toContain("games");
  });

  it("adds 'games' only to the map categories, grass-green", () => {
    expect(MAP_CATEGORY_IDS).toContain("games");
    expect(MAP_CATEGORIES.games.color).toBe(GAMES_COLOR);
    expect(GAMES_COLOR).toBe("#4CAF50");
  });

  it("map categories are the book categories plus games", () => {
    expect(MAP_CATEGORY_IDS).toEqual([...CATEGORY_IDS, "games"]);
  });
});
