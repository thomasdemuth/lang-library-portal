import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDetail,
  findShelf,
  logRead,
  removeRead,
  shelfMapHref,
  OFFLINE_MESSAGE,
  type ShelfHit,
} from "./book-actions-client";

const book = { title: "Dog Man", dedupe_key: "dog-man", isbn13: null };

function respond(status: number, body: unknown) {
  return async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
}

function offline() {
  return async () => {
    throw new TypeError("fetch failed");
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("logRead", () => {
  it("returns the new log row id + message on success", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true, id: 7, message: "Added to your reading log" }));
    expect(await logRead(book)).toEqual({ id: 7, message: "Added to your reading log" });
  });

  it("tolerates a response without an id (no undo offered)", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true }));
    expect(await logRead(book)).toEqual({ id: null, message: "Added to your reading log" });
  });

  it("renders already-logged as a warn", async () => {
    vi.stubGlobal("fetch", respond(409, { error: "You already logged this one" }));
    expect(await logRead(book)).toEqual({ error: "You already logged this one", kind: "warn" });
  });

  it("renders a server failure as an err", async () => {
    vi.stubGlobal("fetch", respond(500, { error: "Database error" }));
    expect(await logRead(book)).toEqual({ error: "Database error", kind: "err" });
  });

  it("renders a network failure as an err", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await logRead(book)).toEqual({ error: OFFLINE_MESSAGE, kind: "err" });
  });
});

describe("removeRead", () => {
  it("returns ok on success", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true }));
    expect(await removeRead(7)).toEqual({ ok: true });
  });

  it("renders an already-gone row as a warn", async () => {
    vi.stubGlobal("fetch", respond(404, { error: "That log entry is already gone." }));
    expect(await removeRead(7)).toEqual({ error: "That log entry is already gone.", kind: "warn" });
  });

  it("renders a server failure as an err", async () => {
    vi.stubGlobal("fetch", respond(500, { error: "Database error" }));
    expect(await removeRead(7)).toEqual({ error: "Database error", kind: "err" });
  });

  it("renders a network failure as an err", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await removeRead(7)).toEqual({ error: OFFLINE_MESSAGE, kind: "err" });
  });
});

describe("findShelf", () => {
  it("returns a certain hit when a letter range narrowed it down", async () => {
    vi.stubGlobal(
      "fetch",
      respond(200, { found: true, ranged: true, tag: "fiction", shelves: [{ id: "A3" }, { id: "A4" }] })
    );
    expect(await findShelf(book)).toEqual({
      shelfId: "A3",
      shelfIds: ["A3", "A4"],
      area: "fiction",
      certain: true,
      message: null,
    });
  });

  it("is certain when the category has only one shelf", async () => {
    vi.stubGlobal("fetch", respond(200, { found: true, ranged: false, tag: "comics", shelves: [{ id: "C1" }] }));
    expect(await findShelf(book)).toEqual({
      shelfId: "C1",
      shelfIds: ["C1"],
      area: "comics",
      certain: true,
      message: null,
    });
  });

  it("does not pick one of several category shelves and call it the answer", async () => {
    vi.stubGlobal(
      "fetch",
      respond(200, { found: true, ranged: false, tag: "young", shelves: [{ id: "Y1" }, { id: "Y2" }, { id: "Y3" }] })
    );
    const result = await findShelf(book);
    expect(result).toEqual({
      shelfId: "Y1",
      shelfIds: ["Y1", "Y2", "Y3"],
      area: "young",
      certain: false,
      message: "Somewhere in Young Reader — check the Young Reader shelves.",
    });
    expect(shelfMapHref(result as ShelfHit)).toBe("/map?shelf=Y1");
  });

  it("stays honest when the category is unknown", async () => {
    vi.stubGlobal("fetch", respond(200, { found: true, ranged: false, shelves: [{ id: "Q1" }, { id: "Q2" }] }));
    expect(await findShelf(book)).toMatchObject({
      certain: false,
      area: null,
      message: "It's on one of several shelves — the map shows which ones.",
    });
  });

  it("keeps the genuine no-shelf note honest (and desk-free)", async () => {
    vi.stubGlobal("fetch", respond(200, { found: false }));
    expect(await findShelf(book)).toEqual({
      message: "“Dog Man” doesn't have a shelf on the map yet.",
      kind: "info",
    });
  });

  it("does not report a fetch failure as a missing shelf", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await findShelf(book)).toEqual({ message: OFFLINE_MESSAGE, kind: "err" });
  });

  it("does not report a server error as a missing shelf", async () => {
    vi.stubGlobal("fetch", respond(500, {}));
    expect(await findShelf(book)).toEqual({ message: OFFLINE_MESSAGE, kind: "err" });
  });
});

describe("fetchDetail", () => {
  it("returns the book on success", async () => {
    vi.stubGlobal("fetch", respond(200, { book: { isbn13: "9780545581608", isbn10: null, description: "A dog. A man." } }));
    expect(await fetchDetail("dog-man")).toEqual({
      book: { isbn13: "9780545581608", isbn10: null, description: "A dog. A man." },
    });
  });

  it("does not report a failed load as a missing description", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await fetchDetail("dog-man")).toEqual({ error: "Couldn't load the description — check the Wi-Fi." });
  });
});
