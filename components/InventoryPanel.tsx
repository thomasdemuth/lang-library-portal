"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { mergeBooks, mergeCollisions, rowToBook, type BookRecord } from "@/lib/match";
import { CATEGORIES, CATEGORY_IDS, pillTextClass, TEACHERS_COLOR, type CategoryId } from "@/lib/categories";
import { announce } from "@/components/Announcer";
import Modal from "@/components/Modal";
import TagPicker, { TagPill, TeachersPill, TeachersToggle } from "@/components/TagPicker";
import TagReviewPanel from "@/components/TagReviewPanel";
import BookEditModal, { type EditableBook } from "@/components/BookEditModal";
import AddBookModal, { type AddedBook } from "@/components/AddBookModal";
import UndoHint from "@/components/UndoHint";
import { clearUndo, pushUndo } from "@/lib/undo";
import { Ic, Pencil, Pin } from "@/components/icons";
import { withBase } from "@/lib/base";

type Sync = {
  id: number;
  status: string;
  source_filename: string | null;
  row_count: number | null;
  merged_count: number | null;
  started_at: string;
  activated_at: string | null;
  superseded_at?: string | null;
  pruned_at?: string | null;
};

/** Diff of a staged import vs. the live catalog (matched on dedupe_key). */
type SyncPreview = {
  added: number;
  removed: number;
  unchanged: number;
  manualMissing: number;
  manualTitles: string[];
};
type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  group_name: string | null;
  dedupe_key: string;
  tag: CategoryId | null;
  /** Marked for teachers — students never see this book. */
  teachers?: boolean;
};

/** "untagged" narrows to books with no tag yet; null is no filter. */
/** "teachers" isn't a category — it's the books-for-teachers slice. */
type TagFilter = CategoryId | "untagged" | "teachers" | null;

type BookDetail = {
  isbn13: string | null;
  isbn10: string | null;
  description: string | null;
  notes: string | null;
};

type Parsed = {
  filename: string;
  rawRows: number;
  skipped: number;
  books: BookRecord[];
  totalCopies: number;
  /** Titles that were fused from ISBN-less rows matching on name alone. */
  mergedByName: number;
};

const BATCH = 500;

/** Optional catalog columns — Title is fixed. Order + visibility are a
 *  per-device preference set from the gear menu. */
const CATALOG_COLS = [
  { id: "tag", label: "Tag" },
  { id: "creators", label: "Creators" },
  { id: "isbn13", label: "ISBN-13" },
  { id: "copies", label: "Copies" },
] as const;
type ColId = (typeof CATALOG_COLS)[number]["id"];
type ColPref = { id: ColId; on: boolean };
const DEFAULT_COLS: ColPref[] = CATALOG_COLS.map((c) => ({ id: c.id, on: true }));
const COL_LABEL = Object.fromEntries(CATALOG_COLS.map((c) => [c.id, c.label])) as Record<ColId, string>;
const COLS_KEY = "ll-catalog-cols";
const COLW_KEY = "ll-catalog-colw"; // dragged column widths (px), by column id

/**
 * Re-key one parsed CSV row from raw headers to the normalized names
 * `rowToBook` reads ("title", "ean_isbn13", "upc_isbn10", "copies", …).
 *
 * This used to be PapaParse's `transformHeader`, but functions can't be
 * structured-cloned across the worker boundary, so the same `trim().toLowerCase()`
 * is applied here instead. First column wins a collision, which is what
 * transformHeader produced too: PapaParse de-duplicates header names *after*
 * transforming them, so a second column normalizing onto a taken name became
 * "title_1" — a key rowToBook never reads. Dropping it here is equivalent.
 * (BOM stripping is unaffected: PapaParse strips it from the raw header
 * before transformHeader ever ran.)
 */
function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of Object.keys(row)) {
    const key = raw.trim().toLowerCase();
    if (!(key in out)) out[key] = row[raw];
  }
  return out;
}

export default function InventoryPanel({ canImport }: { canImport: boolean }) {
  const [active, setActive] = useState<Sync | null>(null);
  const [bookCount, setBookCount] = useState(0);
  const [history, setHistory] = useState<Sync[]>([]);
  const [restorableId, setRestorableId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  // A staged import waiting for the librarian to confirm: rows are uploaded
  // to a pending sync, nothing is live until they press "Import and replace".
  const [confirming, setConfirming] = useState<{ syncId: number; preview: SyncPreview | null } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TagFilter>(null);
  const [results, setResults] = useState<Book[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tagOpen, setTagOpen] = useState<number | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagNote, setTagNote] = useState<string | null>(null);
  const [finding, setFinding] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, BookDetail>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reindex, setReindex] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const [enrichProg, setEnrichProg] = useState<{ total: number; withDescription: number } | null>(null);
  const [editing, setEditing] = useState<EditableBook | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastIdx = useRef<number | null>(null);
  const [bulk, setBulk] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });

  // Undo history belongs to this screen — don't let it outlive the panel.
  useEffect(() => clearUndo, []);

  // Every banner on this screen is a plain <div> (.error / .notice), not a
  // live region, so a screen reader never hears the import results, tag
  // changes or restore confirmations a sighted user reads. These wrappers
  // show and speak in one step; errors interrupt, everything else waits its
  // turn. Clearing a banner (setX(null)) stays a plain setState — there's
  // nothing to announce.
  const showError = useCallback((msg: string) => {
    setError(msg);
    announce(msg, true);
  }, []);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    announce(msg);
  }, []);
  const showTagError = useCallback((msg: string) => {
    setTagError(msg);
    announce(msg, true);
  }, []);

  const [cols, setCols] = useState<ColPref[]>(DEFAULT_COLS);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
      if (!Array.isArray(raw)) return;
      const saved = raw
        .filter((r): r is { id: ColId; on?: boolean } => CATALOG_COLS.some((c) => c.id === r?.id))
        .filter((r, i, arr) => arr.findIndex((s) => s.id === r.id) === i)
        .map((r) => ({ id: r.id, on: r.on !== false }));
      // Columns added after the pref was saved get appended, visible.
      const ids = new Set(saved.map((c) => c.id));
      setCols([...saved, ...DEFAULT_COLS.filter((c) => !ids.has(c.id))]);
    } catch {}
  }, []);
  function updateCols(next: ColPref[]) {
    setCols(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {}
  }
  // Drag the header edges to set column widths (px, per device). Any
  // column can be sized — Title included — and a double-click on the
  // edge puts that column back on autopilot.
  const [colW, setColW] = useState<Record<string, number>>({});
  const colDrag = useRef<{
    id: string;
    nextId: string;
    startX: number;
    startW: number;
    startWNext: number;
  } | null>(null);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLW_KEY) ?? "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
        }
        setColW(clean);
      }
    } catch {}
  }, []);

  function saveColW(next: Record<string, number>) {
    try {
      localStorage.setItem(COLW_KEY, JSON.stringify(next));
    } catch {}
  }

  const MIN_COL_W = 64;

  function onColDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return;
    const th = (e.currentTarget as HTMLElement).closest("th");
    const table = th?.closest("table");
    if (!th || !table) return;

    // A resize adjusts the boundary between this column and the next one:
    // one grows, the next shrinks by the same amount. The total table width
    // never changes, so nothing can ever be pushed past the screen edge.
    const order = ["title", ...visibleCols.map((c) => c.id)];
    const nextId = order[order.indexOf(id) + 1];
    if (!nextId) return; // last column has no handle (nothing to give/take)

    // Freeze every resizable column to its current width, so switching to
    // fixed table layout doesn't reflow the columns you're not dragging.
    const snapshot: Record<string, number> = {};
    table.querySelectorAll<HTMLElement>("thead th[data-colid]").forEach((cell) => {
      const cid = cell.dataset.colid;
      if (cid) snapshot[cid] = Math.round(cell.getBoundingClientRect().width);
    });
    // Normalize the frozen widths so they sum to exactly the space the
    // columns share (container minus the checkbox column). The table then
    // fills the width precisely, and since a resize only trades width
    // between two columns, the total stays put — nothing can spill off screen.
    const wrap = th.closest(".tablewrap");
    const selW = table.querySelector<HTMLElement>("thead th.selcol")?.getBoundingClientRect().width ?? 0;
    const target = (wrap?.clientWidth ?? window.innerWidth) - selW;
    const sum = Object.values(snapshot).reduce((a, b) => a + b, 0);
    if (sum > 0 && target > 0) {
      const k = target / sum;
      for (const key in snapshot) snapshot[key] = Math.max(MIN_COL_W, Math.round(snapshot[key] * k));
    }

    colDrag.current = {
      id,
      nextId,
      startX: e.clientX,
      startW: snapshot[id],
      startWNext: snapshot[nextId],
    };
    setColW(snapshot); // establish explicit widths on all columns up front
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  }

  function onColMove(e: React.PointerEvent<HTMLElement>) {
    const d = colDrag.current;
    if (!d) return;
    // Move the shared boundary: this column and its neighbour trade width,
    // each staying at least MIN_COL_W, and their sum stays constant.
    const pair = d.startW + d.startWNext;
    const newW = Math.max(MIN_COL_W, Math.min(pair - MIN_COL_W, Math.round(d.startW + e.clientX - d.startX)));
    setColW((cur) =>
      cur[d.id] === newW ? cur : { ...cur, [d.id]: newW, [d.nextId]: pair - newW }
    );
  }

  function onColUp() {
    if (!colDrag.current) return;
    colDrag.current = null;
    setColW((cur) => {
      saveColW(cur);
      return cur;
    });
  }

  /** Double-clicking any edge clears custom widths — back to auto-fit. */
  function resetColW() {
    setColW({});
    saveColW({});
  }

  /** The grab edge on a header cell. */
  const colResizer = (id: string) => (
    <span
      className="col-resizer"
      title="Drag to resize — double-click to auto-fit"
      onPointerDown={(e) => onColDown(e, id)}
      onPointerMove={onColMove}
      onPointerUp={onColUp}
      onPointerCancel={onColUp}
      onDoubleClick={resetColW}
      onClick={(e) => e.stopPropagation()}
    />
  );

  function toggleCol(id: ColId) {
    updateCols(cols.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));
  }
  function moveCol(i: number, d: -1 | 1) {
    const next = [...cols];
    const [c] = next.splice(i, 1);
    next.splice(i + d, 0, c);
    updateCols(next);
  }
  const visibleCols = cols.filter((c) => c.on);

  async function load() {
    const res = await fetch(withBase("/api/admin/inventory/syncs"));
    const data = await res.json();
    if (res.ok) {
      setActive(data.active);
      setBookCount(data.bookCount);
      setHistory(data.syncs ?? []);
      setRestorableId(typeof data.restorableId === "number" ? data.restorableId : null);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setNotice(null);
      setParsed(null);
      if (!file.name.toLowerCase().endsWith(".csv")) {
        showError("That doesn't look like a CSV file — export it from Libib first.");
        return;
      }
      // The CSV parser is only needed once a file is picked — keep it out of
      // the initial bundle.
      const Papa = await import("papaparse").then((m) => m.default).catch(() => null);
      if (!Papa) {
        showError("Couldn't load the CSV reader — check your connection and try again.");
        return;
      }

      const complete = (out: { data: Record<string, unknown>[] }) => {
        const books: BookRecord[] = [];
        let skipped = 0;
        for (const row of out.data) {
          const b = rowToBook(normalizeRowKeys(row));
          if (b) books.push(b);
          else skipped++;
        }
        if (books.length === 0) {
          showError("No usable rows found — is this the Libib library export?");
          return;
        }
        // Rows without an ISBN merge on title+author alone, which quietly
        // fuses different books that share a name — surfaced in the summary
        // so it can be reviewed rather than discovered on the shelf.
        const collisions = mergeCollisions(books);
        const merged = mergeBooks(books);
        setParsed({
          filename: file.name,
          rawRows: out.data.length,
          skipped,
          books: merged,
          totalCopies: merged.reduce((n, b) => n + b.copies, 0),
          mergedByName: collisions.length,
        });
        // The parse summary renders in a plain .notice — speak it too, or the
        // file appears to have been swallowed.
        announce(
          `${file.name}: ${merged.length.toLocaleString()} unique titles from ${out.data.length.toLocaleString()} rows. Ready to import.`
        );
      };
      const error = () => showError("Couldn't read that file.");

      // A 6,000-row export locks the main thread for seconds on a school
      // laptop, so parsing runs in PapaParse's blob worker (CSP allows
      // worker-src blob:). The config crosses to the worker by structured
      // clone, which throws on functions — so `transformHeader` can't come
      // along and header normalization happens in `complete` instead, via
      // normalizeRowKeys. If the Worker can't be constructed at all (a
      // stricter CSP somewhere, an old browser), fall back to parsing on
      // the main thread rather than losing CSV import entirely.
      const config = { header: true as const, skipEmptyLines: "greedy" as const, complete, error };
      try {
        Papa.parse<Record<string, unknown>>(file, { ...config, worker: true });
      } catch {
        Papa.parse<Record<string, unknown>>(file, config);
      }
    },
    [showError]
  );

  /**
   * Stage the import: create a pending sync and upload every row, then show
   * the confirmation dialog with a diff against the live catalog. Nothing
   * replaces the live inventory until confirmImport() commits.
   */
  async function runImport() {
    if (!parsed) return;
    setProgress(0);
    setError(null);
    try {
      const create = await fetch(withBase("/api/admin/inventory/syncs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_filename: parsed.filename }),
      });
      const { sync_id, error: cErr } = await create.json();
      if (!create.ok) throw new Error(cErr ?? "Couldn't start the import.");

      for (let i = 0; i < parsed.books.length; i += BATCH) {
        const rows = parsed.books.slice(i, i + BATCH).map(({ ...r }) => r);
        const res = await fetch(withBase(`/api/admin/inventory/syncs/${sync_id}/rows`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        if (!res.ok) {
          await fetch(withBase(`/api/admin/inventory/syncs/${sync_id}`), { method: "DELETE" });
          throw new Error((await res.json()).error ?? "Upload failed — import aborted.");
        }
        setProgress(Math.min(99, Math.round(((i + rows.length) / parsed.books.length) * 100)));
      }

      // Rows are staged — fetch the diff, then ask before replacing anything.
      // A preview that can't be built (older database) never blocks the
      // import; the dialog just shows a plain warning instead of numbers.
      let preview: SyncPreview | null = null;
      try {
        const res = await fetch(withBase(`/api/admin/inventory/syncs/${sync_id}/preview`));
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.preview) preview = data.preview as SyncPreview;
      } catch {
        /* dialog falls back to no numbers */
      }
      setConfirming({ syncId: sync_id, preview });
    } catch (e) {
      showError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setTimeout(() => setProgress(null), 800);
    }
  }

  /** The librarian confirmed — commit the staged sync (atomic swap). */
  async function confirmImport() {
    if (!confirming || !parsed) return;
    setCommitting(true);
    setError(null);
    try {
      const commit = await fetch(withBase(`/api/admin/inventory/syncs/${confirming.syncId}/commit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row_count: parsed.rawRows, merged_count: parsed.books.length }),
      });
      if (!commit.ok) throw new Error((await commit.json()).error ?? "Couldn't activate the import.");
      showNotice(
        `Inventory replaced: ${parsed.books.length.toLocaleString()} titles (${parsed.totalCopies.toLocaleString()} copies) from ${parsed.rawRows.toLocaleString()} CSV rows. The previous catalog is kept for 30 days.`
      );
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setCommitting(false);
      setConfirming(null);
    }
  }

  /** Cancel from the dialog → abort the staged sync (live catalog untouched). */
  async function cancelImport() {
    if (!confirming) return;
    const id = confirming.syncId;
    setConfirming(null);
    try {
      await fetch(withBase(`/api/admin/inventory/syncs/${id}`), { method: "DELETE" });
    } catch {
      /* stale pending syncs are also swept when the next import starts */
    }
    showNotice("Import cancelled — the live catalog is unchanged.");
  }

  /** Bring the most recent superseded generation back live. */
  async function restoreSync(id: number) {
    setRestoring(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(withBase(`/api/admin/inventory/syncs/${id}/restore`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error ?? "Couldn't restore that catalog.");
        return;
      }
      showNotice("Previous catalog restored — it's live again.");
      load();
      search();
    } catch {
      showError("Couldn't restore that catalog.");
    } finally {
      setRestoring(false);
    }
  }

  const filterParam = (tag: TagFilter) =>
    tag === "untagged" ? "&untagged=1" : tag === "teachers" ? "&teachers=only" : tag ? `&tag=${tag}` : "";

  async function search(e?: React.FormEvent, tagOverride?: TagFilter, qOverride?: string) {
    e?.preventDefault();
    setTagError(null);
    const tag = tagOverride === undefined ? filter : tagOverride;
    const res = await fetch(withBase(`/api/admin/books?q=${encodeURIComponent(qOverride ?? q)}${filterParam(tag)}`));
    const data = await res.json();
    if (res.ok) {
      setResults(data.books);
      setTotal(data.total);
      setPage(0);
      setExpanded(null);
      setSelected(new Set()); // selection is per result set
      lastIdx.current = null;
    } else {
      showTagError(data.error ?? "Search failed.");
    }
  }

  /** Toggle a row's checkbox; shift-click extends the range from the last one. */
  function toggleSelect(id: number, index: number, shift: boolean) {
    const anchor = lastIdx.current; // capture before it's overwritten below
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && anchor !== null && results) {
        const [lo, hi] = [anchor, index].sort((a, b) => a - b);
        for (let i = lo; i <= hi; i++) next.add(results[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastIdx.current = index;
  }

  function toggleSelectAll() {
    setSelected((cur) => {
      if (!results) return cur;
      const all = results.every((b) => cur.has(b.id));
      return all ? new Set() : new Set(results.map((b) => b.id));
    });
  }

  /** Apply (or clear) a tag on every selected book at once. */
  /** Write one tag across many books. No history — the do/undo/redo step. */
  async function putBulk(keys: string[], tag: CategoryId | null): Promise<boolean> {
    const res = await fetch(withBase("/api/admin/books/tag/bulk"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_keys: keys, category: tag }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error ?? "Couldn't update tags.";
      setBulk({ busy: false, msg });
      announce(msg, true);
      return false;
    }
    const hit = new Set(keys);
    setResults((cur) => cur?.map((b) => (hit.has(b.dedupe_key) ? { ...b, tag } : b)) ?? cur);
    return true;
  }

  async function bulkTag(tag: CategoryId | null) {
    if (!results || selected.size === 0) return;
    const picked = results.filter((b) => selected.has(b.id));
    const keys = picked.map((b) => b.dedupe_key);
    // Remember each book's own tag — the selection can be a mixed bag, so
    // undo has to restore them one group at a time, not blanket-clear.
    const before = new Map<CategoryId | null, string[]>();
    for (const b of picked) before.set(b.tag, [...(before.get(b.tag) ?? []), b.dedupe_key]);

    setBulk({ busy: true, msg: null });
    try {
      if (!(await putBulk(keys, tag))) return;
      const label = tag
        ? `Tagged ${keys.length} book${keys.length === 1 ? "" : "s"} → ${CATEGORIES[tag].label}`
        : `Cleared the tag on ${keys.length} book${keys.length === 1 ? "" : "s"}`;
      pushUndo({
        label,
        undo: async () => {
          for (const [old, group] of before) await putBulk(group, old);
        },
        redo: async () => void (await putBulk(keys, tag)),
      });
      setBulk({ busy: false, msg: label });
      announce(label);
      setTimeout(() => setBulk((b) => ({ ...b, msg: null })), 5000);
    } catch {
      setBulk({ busy: false, msg: "Couldn't update tags." });
      announce("Couldn't update tags.", true);
    }
  }

  /** Merge a saved edit back into the loaded list + detail cache. */
  function onEdited(u: EditableBook) {
    setResults((cur) =>
      cur?.map((b) =>
        b.id === u.id ? { ...b, title: u.title, creators: u.creators, isbn13: u.isbn13, copies: u.copies, tag: u.tag } : b
      ) ?? cur
    );
    setDetails((cur) => ({ ...cur, [u.id]: { isbn13: u.isbn13, isbn10: u.isbn10, description: u.description, notes: u.notes } }));
    setEditing(null);
  }

  /** Drop a deleted book from the list, count, and any selection. */
  function onDeletedBook(id: number) {
    setResults((cur) => cur?.filter((b) => b.id !== id) ?? cur);
    setTotal((t) => Math.max(0, t - 1));
    setBookCount((c) => Math.max(0, c - 1));
    setSelected((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    setExpanded((cur) => (cur === id ? null : cur));
    setEditing(null);
    showNotice("Book deleted from the live catalog.");
    setTimeout(() => setNotice(null), 4000);
  }

  /** A newly-added title jumps to the top of the list so it's visible. */
  function onAdded(book: AddedBook, wasNew: boolean) {
    setAddOpen(false);
    setResults((cur) => {
      if (!cur) return cur;
      const existing = cur.findIndex((b) => b.id === book.id);
      if (existing >= 0) {
        const next = [...cur];
        next[existing] = { ...next[existing], copies: book.copies, tag: book.tag };
        return next;
      }
      return [book, ...cur];
    });
    if (wasNew) {
      setTotal((t) => t + 1);
      setBookCount((c) => c + 1);
    }
    const copyText = `${book.copies} cop${book.copies === 1 ? "y" : "ies"}`;
    showNotice(
      wasNew
        ? `Added “${book.title}” to the catalog — ${copyText}.`
        : `“${book.title}” was already here — now ${copyText}.`
    );
    setTimeout(() => setNotice(null), 4000);
  }

  /** Load enrichment progress for the status line (lazy, when settings open). */
  const loadEnrichProgress = useCallback(() => {
    fetch(withBase("/api/admin/inventory/enrich"))
      .then((r) => r.json())
      .then((d) => setEnrichProg({ total: d.total ?? 0, withDescription: d.withDescription ?? 0 }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (settingsOpen && !enrichProg) loadEnrichProgress();
  }, [settingsOpen, enrichProg, loadEnrichProgress]);

  function setFilterAndSearch(tag: TagFilter) {
    setFilter(tag);
    search(undefined, tag);
  }

  // Browse without typing: the whole catalog, A→Z, straight away.
  // Arriving from the dashboard's search widget (?q=) prefills the query.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("q");
    if (preset) setQ(preset);
    search(undefined, undefined, preset ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        withBase(`/api/admin/books?q=${encodeURIComponent(q)}&page=${page + 1}${filterParam(filter)}`)
      );
      const data = await res.json();
      if (res.ok) {
        setResults((cur) => [...(cur ?? []), ...data.books]);
        setPage(data.page);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  /** "Where is this book?" → jump to the map with its shelf highlighted. */
  async function findShelf(b: Book) {
    setFinding(b.id);
    setTagError(null);
    try {
      const res = await fetch(withBase(`/api/admin/books/where?key=${encodeURIComponent(b.dedupe_key)}`));
      const data = await res.json();
      if (data.found && data.shelves?.length) {
        if (data.ranged || data.shelves.length === 1) {
          window.location.href = withBase(`/admin/map?shelf=${data.shelves[0].id}`);
          return;
        }
        showTagError(
          `“${b.title}” is somewhere in its category — no letter range narrows it to one shelf. The map shows the category's shelves.`
        );
        return;
      }
      showTagError(
        data.reason === "untagged"
          ? `Tag “${b.title}” first — the shelf is found through its category tag.`
          : `No shelf matches “${b.title}” yet — set categories and letter ranges on the map.`
      );
    } finally {
      setFinding(null);
    }
  }

  /** Write one book's tag. No history — the shared step for do/undo/redo. */
  async function putTag(book: Book, tag: CategoryId | null, teachers?: boolean): Promise<boolean> {
    setTagError(null);
    const res = await fetch(withBase("/api/admin/books/tag"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // teachers omitted → the route keeps whatever the book already had, so
      // changing a category never silently puts a book back in front of
      // students (or takes it away from them).
      body: JSON.stringify({ book_key: book.dedupe_key, category: tag, ...(teachers === undefined ? {} : { teachers }) }),
    });
    if (!res.ok) {
      showTagError((await res.json().catch(() => ({}))).error ?? "Couldn't save the tag.");
      return false;
    }
    setResults(
      (cur) =>
        cur?.map((b) =>
          b.dedupe_key === book.dedupe_key
            ? { ...b, tag, ...(teachers === undefined ? {} : { teachers }) }
            : b
        ) ?? cur
    );
    return true;
  }

  /** Hide a book from students, or put it back. Undoable like the tag itself. */
  async function setTeachers(book: Book, next: boolean) {
    const previous = book.teachers === true;
    if (!(await putTag(book, book.tag, next))) return;
    const label = next
      ? `“${book.title}” is now for teachers only`
      : `“${book.title}” is back in the students' library`;
    pushUndo({
      label,
      undo: async () => void (await putTag(book, book.tag, previous)),
      redo: async () => void (await putTag(book, book.tag, next)),
    });
    setTagNote(label);
    announce(label);
    setTimeout(() => setTagNote((cur) => (cur === label ? null : cur)), 8000);
  }

  async function setTag(book: Book, tag: CategoryId | null) {
    const previous = book.tag;
    if (!(await putTag(book, tag))) return;
    setTagOpen(null);
    const label = tag ? `Tagged “${book.title}” → ${CATEGORIES[tag].label}` : `Cleared the tag on “${book.title}”`;
    pushUndo({
      label,
      undo: async () => void (await putTag(book, previous)),
      redo: async () => void (await putTag(book, tag)),
    });
    setTagNote(label);
    announce(label);
    setTimeout(() => setTagNote((cur) => (cur === label ? null : cur)), 8000);
  }

  /** Tap a row → expand it with cover, description, internal notes. */
  function toggleExpand(b: Book) {
    setExpanded((cur) => (cur === b.id ? null : b.id));
    if (details[b.id]) return;
    fetch(withBase(`/api/admin/books/${b.id}`))
      .then((res) => res.json())
      .then((data) => {
        setDetails((cur) => ({
          ...cur,
          [b.id]: data.book ?? { isbn13: b.isbn13, isbn10: null, description: null, notes: null },
        }));
      })
      .catch(() => {
        setDetails((cur) => ({
          ...cur,
          [b.id]: { isbn13: b.isbn13, isbn10: null, description: null, notes: null },
        }));
      });
  }

  /** One optional catalog cell, keyed so column order can change freely. */
  function cellFor(b: Book, id: ColId) {
    if (id === "tag") {
      return (
        <td key="tag" data-th="Tag">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {canImport ? (
              tagOpen === b.id ? (
                <>
                  <TagPicker value={b.tag} onChange={(t) => setTag(b, t)} dots />
                  <TeachersToggle value={b.teachers === true} onChange={(v) => setTeachers(b, v)} />
                </>
              ) : (
                <button
                  type="button"
                  className="tagbtn"
                  onClick={() => setTagOpen(b.id)}
                  aria-label={`Change tag for ${b.title}`}
                >
                  {b.tag ? <TagPill tag={b.tag} /> : !b.teachers && <span className="tag-none">+ tag</span>}
                  {b.teachers && <TeachersPill small />}
                </button>
              )
            ) : b.tag || b.teachers ? (
              <>
                {b.tag && <TagPill tag={b.tag} />}
                {b.teachers && <TeachersPill small />}
              </>
            ) : (
              "—"
            )}
            {b.tag && tagOpen !== b.id && (
              <button
                type="button"
                className="findbtn"
                disabled={finding === b.id}
                onClick={() => findShelf(b)}
                aria-label={`Show ${b.title} on the map`}
                title="Show on the map"
              >
                {finding === b.id ? "…" : <Pin size={13} />}
              </button>
            )}
          </span>
        </td>
      );
    }
    if (id === "creators") return <td key="creators" data-th="Creators">{b.creators ?? "—"}</td>;
    if (id === "isbn13") return <td key="isbn13" data-th="ISBN-13">{b.isbn13 ?? "—"}</td>;
    return <td key="copies" data-th="Copies">{b.copies}</td>;
  }

  return (
    <>
      {editing && (
        <BookEditModal
          book={editing}
          onClose={() => setEditing(null)}
          onSaved={onEdited}
          onDeleted={onDeletedBook}
        />
      )}
      {addOpen && <AddBookModal onClose={() => setAddOpen(false)} onAdded={onAdded} />}
      {confirming && (
        // Own head rather than Modal's `title`, so the ✕ can stay disabled
        // mid-commit; `onClose` is inert then too, which keeps Escape and the
        // scrim from abandoning an import that's already replacing the catalog.
        <Modal
          open
          onClose={committing ? () => {} : cancelImport}
          labelledBy="import-confirm-title"
        >
          <div className="modal-head">
            <b id="import-confirm-title" data-modal-title tabIndex={-1}>Replace the live catalog?</b>
            <button className="scan-close" onClick={cancelImport} aria-label="Close" disabled={committing}>
              ✕
            </button>
          </div>
          <div style={{ padding: "0 18px" }}>
            {confirming.preview ? (
              <>
                <p style={{ margin: "10px 0 6px" }}>
                  Compared with the live catalog, <b>{parsed?.filename ?? "this file"}</b> has:
                </p>
                <ul style={{ margin: "0 0 10px", paddingLeft: 22 }}>
                  <li>
                    <b>{confirming.preview.added.toLocaleString()}</b> new title
                    {confirming.preview.added === 1 ? "" : "s"}
                  </li>
                  <li>
                    <b>{confirming.preview.removed.toLocaleString()}</b> title
                    {confirming.preview.removed === 1 ? "" : "s"} no longer present
                  </li>
                  <li>
                    <b>{confirming.preview.unchanged.toLocaleString()}</b> unchanged
                  </li>
                </ul>
                {confirming.preview.manualMissing > 0 && (
                  <div className="error" style={{ marginBottom: 10 }}>
                    <b>
                      {confirming.preview.manualMissing.toLocaleString()} title
                      {confirming.preview.manualMissing === 1 ? "" : "s"} added by hand
                    </b>{" "}
                    since the last import {confirming.preview.manualMissing === 1 ? "is" : "are"} missing
                    from this file and will be dropped:
                    <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                      {confirming.preview.manualTitles.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    {confirming.preview.manualMissing > confirming.preview.manualTitles.length && (
                      <p style={{ margin: "6px 0 0" }}>
                        …and{" "}
                        {(confirming.preview.manualMissing - confirming.preview.manualTitles.length).toLocaleString()}{" "}
                        more.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="hint" style={{ margin: "10px 0" }}>
                A change summary isn&rsquo;t available right now — importing will still replace the
                whole live catalog with this file.
              </p>
            )}
            <p className="hint" style={{ margin: "0 0 4px" }}>
              The previous catalog is kept for 30 days — you can restore it from Import history.
            </p>
          </div>
          <div className="modal-actions">
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={cancelImport} disabled={committing}>
              Cancel
            </button>
            <button className="btn brand" onClick={confirmImport} disabled={committing}>
              {committing ? "Importing…" : "Import and replace"}
            </button>
          </div>
        </Modal>
      )}
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Mobile: sits directly under the Manage Book Requests button */}
      {canImport && (
        <button
          className="btn mobile-only"
          style={{ width: "100%", marginBottom: 14 }}
          onClick={() => setReviewing(true)}
        >
          <Ic name="sparkle" size={15} /> Review suggested tags
        </button>
      )}

      <div className="card inv-panel" style={{ marginBottom: 20 }}>
        {reviewing && (
          <TagReviewPanel
            onDone={() => {
              setReviewing(false);
              search();
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
          <form onSubmit={search} className="searchrow" style={{ flex: 1 }}>
            <input
              className="input"
              placeholder="Title or author…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="searchbtn" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.5-4.5" />
              </svg>
            </button>
          </form>
          {canImport && (
            <div className="invtools desk-only">
              <button
                type="button"
                className="gearbtn addbtn"
                aria-label="Add a title"
                title="Add a title"
                onClick={() => setAddOpen(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                className={`gearbtn${settingsOpen ? " on" : ""}`}
                aria-label="Catalog settings"
                aria-expanded={settingsOpen}
                title="Catalog settings"
                onClick={() => setSettingsOpen((o) => !o)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {canImport && settingsOpen && (
          <div className="catset desk-only">
            <div role="group" aria-labelledby="catset-inventory">
              <span className="lbl" id="catset-inventory">Inventory</span>
              <p className="hint" style={{ margin: "2px 0 10px" }}>
                {active ? (
                  <>
                    <b>{bookCount.toLocaleString()}</b> titles live · from{" "}
                    <b>{active.source_filename ?? "CSV"}</b> · imported{" "}
                    {active.activated_at ? new Date(active.activated_at).toLocaleString() : "—"}
                  </>
                ) : (
                  "No inventory yet — upload the Libib CSV export."
                )}
              </p>
              <div
                className={`catset-drop${dragOver ? " over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <p className="hint" style={{ margin: "0 0 8px" }}>
                  Libib → your library → Export → CSV. Drop the file here (or choose it). The
                  current inventory stays live until the new one is fully imported — you&rsquo;ll
                  confirm a summary of the changes before anything is replaced.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  aria-label="Libib CSV export"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {parsed && (
                  <div style={{ marginTop: 12 }}>
                    <div className="notice">
                      <b>{parsed.filename}</b>: {parsed.books.length.toLocaleString()} unique titles ·{" "}
                      {parsed.totalCopies.toLocaleString()} total copies · from{" "}
                      {parsed.rawRows.toLocaleString()} rows
                      {parsed.skipped > 0 ? ` (${parsed.skipped} rows without titles skipped)` : ""}
                      {parsed.mergedByName > 0 && (
                        <div className="hint" style={{ marginTop: 6 }}>
                          {parsed.mergedByName.toLocaleString()} title
                          {parsed.mergedByName === 1 ? " was" : "s were"} merged from same-name rows without
                          an ISBN — review after import.
                        </div>
                      )}
                    </div>
                    <button className="btn primary" onClick={runImport} disabled={progress !== null}>
                      {progress !== null ? `Importing… ${progress}%` : "Import & replace inventory"}
                    </button>
                  </div>
                )}
                {progress !== null && (
                  <div style={{ marginTop: 12, background: "#eef0f5", borderRadius: 6, height: 10 }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        borderRadius: 6,
                        background: "var(--ok)",
                        transition: "width .2s",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div role="group" aria-labelledby="catset-history">
              <span className="lbl" id="catset-history">Import history</span>
              {history.length === 0 ? (
                <p className="hint" style={{ margin: "2px 0 0" }}>No imports yet.</p>
              ) : (
                <div className="tablewrap" style={{ marginTop: 6 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>File</th>
                        <th>Titles</th>
                        <th>Status</th>
                        {restorableId !== null && <th aria-label="Actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((s) => (
                        <tr key={s.id}>
                          <td>{new Date(s.started_at).toLocaleString()}</td>
                          <td>{s.source_filename ?? "—"}</td>
                          <td>{s.merged_count?.toLocaleString() ?? "—"}</td>
                          <td>
                            <span
                              className="pill"
                              style={{
                                background:
                                  s.status === "active"
                                    ? "#e7f6f3"
                                    : s.status === "pending"
                                      ? "#fff6e6"
                                      : "#f3f4f7",
                              }}
                            >
                              {s.status}
                            </span>
                          </td>
                          {restorableId !== null && (
                            <td>
                              {s.id === restorableId && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  disabled={restoring}
                                  title="Make this catalog live again"
                                  onClick={() => restoreSync(s.id)}
                                >
                                  {restoring ? "Restoring…" : "Restore"}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {restorableId !== null && (
                <p className="hint" style={{ margin: "6px 0 0" }}>
                  A replaced catalog can be restored for 30 days after an import.
                </p>
              )}
            </div>
            <div role="group" aria-labelledby="catset-columns">
              <span className="lbl" id="catset-columns">Catalog columns</span>
              <p className="hint" style={{ margin: "2px 0 8px" }}>
                Title always shows. Reorder with the arrows — drag a column&rsquo;s edge in the table to
                resize it.
                {Object.keys(colW).length > 0 && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="linklike"
                      onClick={() => {
                        setColW({});
                        saveColW({});
                      }}
                    >
                      Reset column widths
                    </button>
                  </>
                )}
              </p>
              {cols.map((c, i) => (
                <div key={c.id} className="colrow">
                  <label className="check">
                    <input type="checkbox" checked={c.on} onChange={() => toggleCol(c.id)} />
                    {COL_LABEL[c.id]}
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === 0}
                    onClick={() => moveCol(i, -1)}
                    aria-label={`Move ${COL_LABEL[c.id]} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === cols.length - 1}
                    onClick={() => moveCol(i, 1)}
                    aria-label={`Move ${COL_LABEL[c.id]} down`}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
            <div role="group" aria-labelledby="catset-sort">
              <span className="lbl" id="catset-sort">Sort order</span>
              <p className="hint" style={{ margin: "2px 0 8px" }}>
                The catalog lists books by author surname. New imports are sorted
                automatically; re-index to sort books imported before this feature.
              </p>
              <button
                type="button"
                className="btn"
                disabled={reindex.busy}
                onClick={async () => {
                  setReindex({ busy: true, msg: null });
                  try {
                    const res = await fetch(withBase("/api/admin/inventory/reindex-authors"), { method: "POST" });
                    const data = await res.json().catch(() => ({}));
                    const msg = res.ok
                      ? `Sorted ${(data.updated ?? 0).toLocaleString()} books by author.`
                      : data.error ?? "Couldn't re-index.";
                    setReindex({ busy: false, msg });
                    announce(msg, !res.ok);
                  } catch {
                    setReindex({ busy: false, msg: "Couldn't re-index." });
                    announce("Couldn't re-index.", true);
                  }
                }}
              >
                {reindex.busy ? "Re-indexing…" : "Re-index by author"}
              </button>
              {reindex.msg && (
                <p className="hint" style={{ margin: "8px 0 0" }}>{reindex.msg}</p>
              )}
            </div>
            <div role="group" aria-labelledby="catset-covers">
              <span className="lbl" id="catset-covers">Covers &amp; descriptions</span>
              <p className="hint" style={{ margin: "2px 0 8px" }}>
                Missing descriptions and covers fill in <b>automatically</b> from Open Library and
                Google Books — a little each night over the coming weeks. Nothing to press; it only
                ever fills blanks and never overwrites your catalog data.
              </p>
              {enrichProg && enrichProg.total > 0 && (
                <>
                  <div className="enrich-bar" aria-hidden>
                    <div
                      className="enrich-fill"
                      style={{ width: `${Math.round((enrichProg.withDescription / enrichProg.total) * 100)}%` }}
                    />
                  </div>
                  <p className="hint" style={{ margin: "6px 0 0" }}>
                    {enrichProg.withDescription.toLocaleString()} of {enrichProg.total.toLocaleString()} books have a
                    description ({Math.round((enrichProg.withDescription / enrichProg.total) * 100)}%).
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        <div className="tagpicker tagfilter" style={{ marginTop: 10 }} role="radiogroup" aria-label="Filter by tag">
          {CATEGORY_IDS.map((id) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`tagchip${active ? ` active ${pillTextClass(id)}` : ""}`}
                style={active ? { background: CATEGORIES[id].color, borderColor: CATEGORIES[id].color, color: "#fff" } : undefined}
                onClick={() => setFilterAndSearch(active ? null : id)}
                title={CATEGORIES[id].label}
              >
                {!active && <span className="dot" style={{ background: CATEGORIES[id].color }} />}
                <span className="tagchip-label">{CATEGORIES[id].label}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={filter === "teachers"}
            className={`tagchip${filter === "teachers" ? ` active ${pillTextClass("teachers")}` : ""}`}
            style={
              filter === "teachers"
                ? { background: TEACHERS_COLOR, borderColor: TEACHERS_COLOR, color: "#fff" }
                : undefined
            }
            onClick={() => setFilterAndSearch(filter === "teachers" ? null : "teachers")}
            title="Books for Teachers — hidden from students"
          >
            {filter !== "teachers" && <span className="dot" style={{ background: TEACHERS_COLOR }} />}
            <span className="tagchip-label">For Teachers</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={filter === "untagged"}
            className={`tagchip untagged${filter === "untagged" ? " active" : ""}`}
            onClick={() => setFilterAndSearch(filter === "untagged" ? null : "untagged")}
            title="Untagged"
          >
            {filter !== "untagged" && <span className="dot dot-none" />}
            <span className="tagchip-label">Untagged</span>
          </button>
          {canImport && (
            <button type="button" className="tagchip desk-only" onClick={() => setReviewing(true)}>
              <Ic name="sparkle" size={13} /> Suggested tags
            </button>
          )}
        </div>
        {tagError && <div className="error" style={{ marginTop: 10 }}>{tagError}</div>}
        {tagNote && (
          <div className="notice" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ flex: 1 }}>{tagNote}</span>
            <UndoHint />
          </div>
        )}
        {canImport && selected.size > 0 && (
          <div className="bulkbar">
            <b>{selected.size} selected</b>
            <span className="hint" style={{ margin: 0 }}>Set tag:</span>
            <TagPicker value={null} onChange={(t) => bulkTag(t)} dots disabled={bulk.busy} />
            <button type="button" className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setSelected(new Set())}>
              Deselect
            </button>
            {bulk.msg && (
              <span className="hint" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                {bulk.msg} <UndoHint />
              </span>
            )}
          </div>
        )}
        {results && (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              {total.toLocaleString()} {q.trim() ? `result${total === 1 ? "" : "s"}` : "titles"}
              {total > results.length ? ` (showing ${results.length.toLocaleString()})` : ""}
            </p>
            <div className="tablewrap">
              <table className={`table books${Object.keys(colW).length > 0 ? " fixedcols" : ""}`}>
                <thead>
                  <tr>
                    {canImport && (
                      <th className="selcol">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={results.length > 0 && results.every((b) => selected.has(b.id))}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th data-colid="title" style={colW.title ? { width: colW.title } : undefined}>
                      Title
                      {visibleCols.length > 0 && colResizer("title")}
                    </th>
                    {visibleCols.map((c, i) => (
                      <th key={c.id} data-colid={c.id} style={colW[c.id] ? { width: colW[c.id] } : undefined}>
                        {COL_LABEL[c.id]}
                        {/* No handle on the last column — a resize trades width
                            with the next column, and the last has none. */}
                        {i < visibleCols.length - 1 && colResizer(c.id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((b, i) => {
                    const open = expanded === b.id;
                    const d = details[b.id];
                    const coverIsbn = d?.isbn13 ?? d?.isbn10 ?? b.isbn13;
                    const cols = (canImport ? 1 : 0) + 1 + visibleCols.length;
                    return (
                      <Fragment key={b.id}>
                        <tr
                          className={`bookrow${open ? " open" : ""}${selected.has(b.id) ? " selected" : ""}`}
                          aria-expanded={open}
                          onClick={() => toggleExpand(b)}
                        >
                          {canImport && (
                            <td className="selcol" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${b.title}`}
                                checked={selected.has(b.id)}
                                onChange={() => {}}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(b.id, i, e.shiftKey);
                                }}
                              />
                            </td>
                          )}
                          <td data-th="Title">{b.title}</td>
                          {visibleCols.map((c) => cellFor(b, c.id))}
                        </tr>
                        {open && (
                          <tr className="bookrow-detail">
                            <td colSpan={cols}>
                              <div className="bookdetail">
                                {coverIsbn && (
                                  <img
                                    className="bookcover"
                                    src={withBase(`/api/admin/books/cover?isbn=${coverIsbn}`)}
                                    alt={`Cover of ${b.title}`}
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                )}
                                <div style={{ flex: 1 }}>
                                  {!d ? (
                                    <p className="hint" style={{ marginTop: 0 }}>Loading…</p>
                                  ) : (
                                    <>
                                      {d.description ? (
                                        <p className="bookdesc">{d.description}</p>
                                      ) : (
                                        <p className="hint" style={{ marginTop: 0 }}>No description on file.</p>
                                      )}
                                      {d.notes && (
                                        <p className="booknotes">
                                          <b>Internal:</b> {d.notes}
                                        </p>
                                      )}
                                    </>
                                  )}
                                  {canImport && (
                                    <button
                                      className="btn editbtn"
                                      style={{ marginTop: 10, padding: "6px 14px", fontSize: 13 }}
                                      onClick={() =>
                                        setEditing({
                                          id: b.id,
                                          title: b.title,
                                          creators: b.creators,
                                          isbn13: d?.isbn13 ?? b.isbn13,
                                          isbn10: d?.isbn10 ?? null,
                                          copies: b.copies,
                                          description: d?.description ?? null,
                                          notes: d?.notes ?? null,
                                          tag: b.tag,
                                          dedupe_key: b.dedupe_key,
                                        })
                                      }
                                    >
                                      <Pencil size={14} /> Edit book
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length < total && (
              <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Show more (${(total - results.length).toLocaleString()} left)`}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
