import { describe, expect, it } from "vitest";
import {
  describeBanner,
  dismissStorageKey,
  isAllowedHref,
  isDismissed,
  nextContentRev,
  pickActiveBanner,
  type BannerRow,
} from "./banners";

const NOW = Date.parse("2026-08-13T12:00:00Z");
const day = 24 * 3600 * 1000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * day).toISOString();

function banner(over: Partial<BannerRow> = {}): BannerRow {
  return {
    id: 1,
    message: "Hello",
    cta_label: null,
    cta_href: null,
    cta_href_guest: null,
    audience: "all",
    tone: "info",
    icon: "sparkle",
    enabled: true,
    starts_at: null,
    ends_at: null,
    dismiss_days: 30,
    hide_when_answered: false,
    legacy_key: null,
    content_rev: 1,
    created_at: iso(-30),
    updated_at: iso(-30),
    ...over,
  };
}

const student = { audience: "student" as const };
const staff = { audience: "staff" as const };
const guest = { audience: "student" as const, isGuest: true };

describe("pickActiveBanner", () => {
  it("returns nothing when there is nothing to show", () => {
    expect(pickActiveBanner([], NOW, student)).toBeNull();
    expect(pickActiveBanner([banner({ enabled: false })], NOW, student)).toBeNull();
  });

  it("shows an enabled banner with no dates at all", () => {
    expect(pickActiveBanner([banner()], NOW, student)?.id).toBe(1);
  });

  it("respects the scheduled window, inclusive of the start and exclusive of the end", () => {
    const future = banner({ id: 2, starts_at: iso(1) });
    const past = banner({ id: 3, ends_at: iso(-1) });
    expect(pickActiveBanner([future, past], NOW, student)).toBeNull();

    const startsNow = banner({ id: 4, starts_at: new Date(NOW).toISOString() });
    expect(pickActiveBanner([startsNow], NOW, student)?.id).toBe(4);
    const endsNow = banner({ id: 5, ends_at: new Date(NOW).toISOString() });
    expect(pickActiveBanner([endsNow], NOW, student)).toBeNull();
  });

  it("hands over to a scheduled banner the moment it starts", () => {
    const current = banner({ id: 1, starts_at: iso(-10) });
    const next = banner({ id: 2, starts_at: iso(1) });
    // Before Monday the old one is still live...
    expect(pickActiveBanner([current, next], NOW, student)?.id).toBe(1);
    // ...and after it, the new one takes over on its own.
    expect(pickActiveBanner([current, next], NOW + 2 * day, student)?.id).toBe(2);
  });

  it("breaks ties on the newer row", () => {
    const a = banner({ id: 7 });
    const b = banner({ id: 9 });
    expect(pickActiveBanner([a, b], NOW, student)?.id).toBe(9);
  });

  it("filters by audience, with 'all' counting for both", () => {
    const forStudents = banner({ id: 1, audience: "student" });
    const forStaff = banner({ id: 2, audience: "staff" });
    expect(pickActiveBanner([forStudents, forStaff], NOW, student)?.id).toBe(1);
    expect(pickActiveBanner([forStudents, forStaff], NOW, staff)?.id).toBe(2);
    expect(pickActiveBanner([banner({ audience: "all" })], NOW, staff)?.id).toBe(1);
  });

  it("hides a banner from guests when its link is one they can't follow", () => {
    const noGuestLink = banner({ cta_href: "/feedback?src=banner" });
    expect(pickActiveBanner([noGuestLink], NOW, guest)).toBeNull();
    expect(pickActiveBanner([noGuestLink], NOW, student)?.id).toBe(1);

    const withGuestLink = banner({ cta_href: "/feedback", cta_href_guest: "/hi/site" });
    expect(pickActiveBanner([withGuestLink], NOW, guest)?.id).toBe(1);
  });

  it("shows a link-free announcement to guests too", () => {
    expect(pickActiveBanner([banner({ cta_href: null })], NOW, guest)?.id).toBe(1);
  });
});

describe("describeBanner", () => {
  it("labels each row for the management list", () => {
    const only = (row: BannerRow) => describeBanner(row, [row], NOW).state;
    expect(only(banner({ enabled: false }))).toBe("off");
    expect(only(banner({ ends_at: iso(-1) }))).toBe("ended");
    expect(only(banner({ starts_at: iso(1) }))).toBe("scheduled");
    expect(only(banner())).toBe("live");
  });

  it("calls an enabled, in-window loser 'waiting' rather than live", () => {
    const winner = banner({ id: 2, starts_at: iso(-1) });
    const loser = banner({ id: 1, starts_at: iso(-5) });
    const rows = [winner, loser];
    expect(describeBanner(winner, rows, NOW).state).toBe("live");
    expect(describeBanner(loser, rows, NOW).state).toBe("waiting");
  });

  it("reports exactly who each banner is live for", () => {
    const forStudents = banner({ id: 1, audience: "student" });
    const forStaff = banner({ id: 2, audience: "staff" });
    const rows = [forStudents, forStaff];
    expect(describeBanner(forStudents, rows, NOW).liveFor).toEqual(["Students", "Guests"]);
    expect(describeBanner(forStaff, rows, NOW).liveFor).toEqual(["Teachers"]);
  });

  it("leaves guests out when the banner has a link they can't follow", () => {
    const row = banner({ cta_href: "/feedback" });
    expect(describeBanner(row, [row], NOW).liveFor).toEqual(["Students", "Teachers"]);
  });
});

describe("nextContentRev", () => {
  const before = {
    message: "Hello",
    cta_label: "Tell us",
    cta_href: "/feedback",
    cta_href_guest: null,
  };

  it("bumps when the wording or a link changes", () => {
    expect(nextContentRev(3, before, { message: "Something new" })).toBe(4);
    expect(nextContentRev(3, before, { cta_href: "/map" })).toBe(4);
  });
  it("does not bump for a re-save, a color change, or an on/off toggle", () => {
    expect(nextContentRev(3, before, {})).toBe(3);
    expect(nextContentRev(3, before, { message: "Hello" })).toBe(3);
  });
  it("always bumps when the admin asks for it explicitly", () => {
    expect(nextContentRev(3, before, {}, true)).toBe(4);
  });
});

describe("dismissal", () => {
  const b = { id: 4, rev: 2, dismissDays: 30 };

  it("keys storage per banner and content revision", () => {
    expect(dismissStorageKey(b)).toBe("lang_banner_4r2");
    // A rewrite means a new key, so nothing is stored under it yet.
    expect(dismissStorageKey({ ...b, rev: 3 })).not.toBe(dismissStorageKey(b));
  });

  it("treats a fresh dismissal as dismissed and an expired one as not", () => {
    expect(isDismissed(b, String(NOW - 2 * day), NOW)).toBe(true);
    expect(isDismissed(b, String(NOW - 31 * day), NOW)).toBe(false);
  });

  it("never expires when the banner offers no dismiss button", () => {
    expect(isDismissed({ ...b, dismissDays: 0 }, String(NOW - 900 * day), NOW)).toBe(true);
  });

  it("is not dismissed with nothing stored or a junk value", () => {
    expect(isDismissed(b, null, NOW)).toBe(false);
    expect(isDismissed(b, "nonsense", NOW)).toBe(false);
    expect(isDismissed(b, "0", NOW)).toBe(false);
  });
});

describe("isAllowedHref", () => {
  it("accepts site paths and https URLs", () => {
    expect(isAllowedHref("/feedback?src=banner")).toBe(true);
    expect(isAllowedHref("https://thelangschool.org/news")).toBe(true);
  });
  it("rejects script, protocol-relative, plain http, and empty links", () => {
    expect(isAllowedHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedHref("//evil.example/x")).toBe(false);
    expect(isAllowedHref("http://insecure.example")).toBe(false);
    expect(isAllowedHref("data:text/html,hi")).toBe(false);
    expect(isAllowedHref("   ")).toBe(false);
  });
});
