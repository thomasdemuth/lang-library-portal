import { describe, expect, it } from "vitest";
import {
  BADGES,
  badgeProgress,
  earnedSlugs,
  emptyStats,
  getBadge,
  newlyEarned,
  nextInGroup,
  type BadgeStats,
} from "./badges";
import { greeting } from "./greeting";
import { ordinal, praiseForRead, praiseForTakeHome } from "./praise";
import { CATEGORY_IDS, type CategoryId } from "./categories";

/** Stats that put exactly one badge's `progress` at `value`. */
function statsFor(slug: string, value: number): BadgeStats {
  const b = getBadge(slug)!;
  const s = emptyStats();
  const genres = CATEGORY_IDS.filter((id) => id !== "other");
  switch (b.group) {
    case "reading":
      s.booksLogged = value;
      break;
    case "hearts":
      s.favorites = value;
      break;
    case "lists":
      s.listsWithBooks = value;
      s.booksInLists = value;
      break;
    case "genres":
      s.genres = genres.slice(0, Math.max(0, Math.min(genres.length, value)));
      break;
    case "trips":
      s.takenHome = value;
      s.broughtBack = value;
      break;
    case "friends":
      s.friends = value;
      break;
  }
  return s;
}

/** The no-failure guardrail, as a regex. */
const NEGATIVE = /\b(lost|lose|missed|miss|failed|fail|streak|behind|only|broke|broken)\b/i;

describe("badge definitions", () => {
  it("has unique, stable, well-formed slugs", () => {
    const slugs = BADGES.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("gives every badge a reachable goal and real copy", () => {
    for (const b of BADGES) {
      expect(b.goal).toBeGreaterThanOrEqual(1);
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.blurb.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
    }
  });

  it("never phrases a nudge as a failure", () => {
    for (const b of BADGES) {
      for (let left = 1; left <= b.goal; left++) {
        const text = b.nudge(left);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(NEGATIVE);
      }
      expect(b.blurb).not.toMatch(NEGATIVE);
    }
  });
});

describe("earning", () => {
  it("earns nothing on an empty shelf", () => {
    expect(earnedSlugs(emptyStats())).toEqual([]);
  });

  it("earns each badge exactly at its goal, and stays earned above it", () => {
    for (const b of BADGES) {
      expect(badgeProgress(b, statsFor(b.slug, b.goal - 1)).done).toBe(false);
      expect(badgeProgress(b, statsFor(b.slug, b.goal)).done).toBe(true);
      expect(badgeProgress(b, statsFor(b.slug, b.goal + 5)).done).toBe(true);
    }
  });

  it("clamps progress into [0, goal]", () => {
    for (const b of BADGES) {
      expect(badgeProgress(b, statsFor(b.slug, -3)).value).toBe(0);
      expect(badgeProgress(b, statsFor(b.slug, b.goal * 4)).value).toBe(b.goal);
    }
  });

  it("returns earned slugs in shelf order", () => {
    const s = emptyStats();
    s.booksLogged = 12;
    expect(earnedSlugs(s)).toEqual(["first-page", "bookworm", "page-turner"]);
  });
});

describe("genre badges", () => {
  const real = CATEGORY_IDS.filter((id) => id !== "other") as CategoryId[];

  it("ignores the 'other' catch-all tag", () => {
    const withOther = emptyStats();
    withOther.genres = [...real, "other"];
    expect(earnedSlugs(withOther)).toContain("whole-shelf");

    const shortOne = emptyStats();
    shortOne.genres = [...real.slice(0, real.length - 1), "other"];
    expect(earnedSlugs(shortOne)).not.toContain("whole-shelf");
  });

  it("counts each kind once, however many books carry it", () => {
    const s = emptyStats();
    s.genres = ["fiction", "fiction", "fiction", "comics"];
    expect(badgeProgress(getBadge("genre-hopper")!, s).value).toBe(2);
  });
});

describe("newlyEarned", () => {
  it("reports additions in shelf order", () => {
    const got = newlyEarned(["first-page"], ["first-page", "bookworm", "book-buddy"]);
    expect(got.map((b) => b.slug)).toEqual(["bookworm", "book-buddy"]);
  });

  it("reports nothing when the set is unchanged", () => {
    expect(newlyEarned(["first-page"], ["first-page"])).toEqual([]);
  });

  it("never reports anything for a shrinking set — a badge is never taken back", () => {
    expect(newlyEarned(["first-page", "bookworm"], ["first-page"])).toEqual([]);
    expect(newlyEarned(["first-page"], [])).toEqual([]);
  });
});

describe("nextInGroup", () => {
  it("offers one reachable badge in every group on day one", () => {
    const next = nextInGroup(emptyStats());
    const groups = new Set(BADGES.map((b) => b.group));
    expect(next.size).toBe(groups.size);
    for (const [group, badge] of next) expect(badge.group).toBe(group);
  });

  it("never offers a badge that is already earned", () => {
    const s = emptyStats();
    s.booksLogged = 7;
    const next = nextInGroup(s);
    expect(next.get("reading")!.slug).toBe("page-turner");
    for (const badge of next.values()) expect(badgeProgress(badge, s).done).toBe(false);
  });

  it("drops a group once all of its badges are earned", () => {
    const s = emptyStats();
    s.friends = 3;
    expect(nextInGroup(s).has("friends")).toBe(false);
  });

  it("offers nothing at all once the whole set is collected", () => {
    const s: BadgeStats = {
      booksLogged: 100,
      favorites: 100,
      listsWithBooks: 100,
      booksInLists: 100,
      genres: CATEGORY_IDS.slice(),
      takenHome: 100,
      broughtBack: 100,
      friends: 100,
    };
    expect(earnedSlugs(s).length).toBe(BADGES.length);
    expect(nextInGroup(s).size).toBe(0);
  });
});

describe("praise", () => {
  const first = () => 0; // deterministic: always the first cheer

  it("marks the very first book", () => {
    expect(praiseForRead(1, first)).toBe("Your reading log has begun!");
  });

  it("marks every tenth book", () => {
    expect(praiseForRead(10, first)).toBe("Ten more! That's 10 books this year.");
    expect(praiseForRead(20, first)).toBe("Ten more! That's 20 books this year.");
  });

  it("names the running total the rest of the time", () => {
    expect(praiseForRead(7, first)).toContain("7 books this year");
    expect(praiseForRead(2, first)).toContain("2 books this year");
  });

  it("is never negative, anywhere in the range", () => {
    for (let n = 1; n <= 60; n++) {
      for (const r of [() => 0, () => 0.5, () => 0.99]) {
        expect(praiseForRead(n, r)).not.toMatch(NEGATIVE);
      }
    }
  });

  it("stays sane on junk input", () => {
    expect(praiseForRead(0, first)).toBe("Your reading log has begun!");
    expect(praiseForRead(-4, first)).toBe("Your reading log has begun!");
    expect(praiseForRead(NaN, first)).toBe("Your reading log has begun!");
  });

  it("counts book trips home with an ordinal", () => {
    expect(praiseForTakeHome(1)).toBe("That's your 1st book home!");
    expect(praiseForTakeHome(3)).toBe("That's your 3rd book home!");
    expect(praiseForTakeHome(11)).toBe("That's your 11th book home!");
    expect(praiseForTakeHome(22)).toBe("That's your 22nd book home!");
  });

  it("ordinals the teens correctly", () => {
    expect(["11th", "12th", "13th"]).toEqual([ordinal(11), ordinal(12), ordinal(13)]);
    expect([ordinal(21), ordinal(102), ordinal(113)]).toEqual(["21st", "102nd", "113th"]);
  });
});

describe("greeting", () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m);

  it("changes with the local clock", () => {
    expect(greeting(at(6))).toBe("Good morning");
    expect(greeting(at(11, 59))).toBe("Good morning");
    expect(greeting(at(12))).toBe("Good afternoon");
    expect(greeting(at(16, 59))).toBe("Good afternoon");
    expect(greeting(at(17))).toBe("Good evening");
    expect(greeting(at(23, 59))).toBe("Good evening");
  });
});
