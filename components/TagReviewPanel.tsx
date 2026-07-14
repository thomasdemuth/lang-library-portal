"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import TagPicker, { TagPill } from "@/components/TagPicker";

type Book = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  dedupe_key: string;
};
type Suggestion = { tag: CategoryId; confidence: number; reasons: string[] };

/**
 * Run through untagged books one card at a time: each shows the book and
 * a suggested tag with a confidence percentage — accept it, pick another
 * tag, or skip. Suggestions for upcoming cards prefetch in the background
 * so the flow never waits on the network.
 */
export default function TagReviewPanel({ onDone }: { onDone: () => void }) {
  const [queue, setQueue] = useState<Book[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [tagged, setTagged] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ book: Book; tag: CategoryId; idx: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const suggestions = useRef<Map<string, Suggestion | "pending" | "none">>(new Map());
  const [, bump] = useState(0); // re-render when a prefetch lands
  const pageRef = useRef(0);

  const loadPage = useCallback(async (page: number) => {
    const res = await fetch(`/api/admin/books?untagged=1&page=${page}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't load untagged books.");
      return;
    }
    setTotal(data.total);
    setQueue((cur) => [...cur, ...data.books]);
  }, []);

  useEffect(() => {
    loadPage(0).finally(() => setLoading(false));
  }, [loadPage]);

  // Prefetch suggestions for the current card and the next two.
  useEffect(() => {
    for (const book of queue.slice(idx, idx + 3)) {
      if (suggestions.current.has(book.dedupe_key)) continue;
      suggestions.current.set(book.dedupe_key, "pending");
      fetch(`/api/admin/books/suggest?key=${encodeURIComponent(book.dedupe_key)}`)
        .then((r) => r.json())
        .then((d) => suggestions.current.set(book.dedupe_key, d.suggestion ?? "none"))
        .catch(() => suggestions.current.set(book.dedupe_key, "none"))
        .finally(() => bump((n) => n + 1));
    }
    // top up the queue near the end
    if (queue.length - idx < 5 && total !== null && queue.length < total) {
      pageRef.current += 1;
      loadPage(pageRef.current);
    }
  }, [idx, queue, total, loadPage]);

  const book = queue[idx];
  const suggestion = book ? suggestions.current.get(book.dedupe_key) : undefined;

  async function applyTag(tag: CategoryId) {
    if (!book || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/books/tag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_key: book.dedupe_key, category: tag }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the tag.");
        return;
      }
      setTagged((n) => n + 1);
      setLast({ book, tag, idx });
      setIdx((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  async function undoLast() {
    if (!last || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/books/tag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_key: last.book.dedupe_key, category: null }),
      });
      if (!res.ok) return;
      setTagged((n) => Math.max(0, n - 1));
      setIdx(last.idx);
      setLast(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-overlay">
      <div className="review-top">
        <b>Review suggested tags</b>
        <span className="hint" style={{ margin: 0 }}>
          {tagged} tagged{total !== null ? ` · ${Math.max(0, total - tagged).toLocaleString()} to go` : ""}
        </span>
        <button className="scan-close" onClick={onDone} aria-label="Close review" style={{ marginLeft: "auto" }}>
          ✕
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {last && (
        <div className="notice" style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 520, margin: "0 auto 12px" }}>
          <span style={{ flex: 1 }}>
            Tagged “{last.book.title}” → {CATEGORIES[last.tag].label}
          </span>
          <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} disabled={busy} onClick={undoLast}>
            ↩ Undo
          </button>
        </div>
      )}

      {loading ? (
        <p className="hint" style={{ padding: 20 }}>Loading untagged books…</p>
      ) : !book ? (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <h2>All done</h2>
          <p className="hint">Every book in the queue has been reviewed.</p>
          <button className="btn primary" onClick={onDone}>Close</button>
        </div>
      ) : (
        <div className="card review-card" key={book.id}>
          <div className="scan-bookrow">
            {book.isbn13 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="scan-cover"
                src={`/api/admin/books/cover?isbn=${book.isbn13}`}
                alt=""
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
            <div>
              <div className="scan-title">{book.title}</div>
              <div className="scan-meta">{book.creators ?? "Unknown author"}</div>
            </div>
          </div>

          {suggestion === "pending" || suggestion === undefined ? (
            <p className="hint" style={{ margin: 0 }}>✨ Looking it up…</p>
          ) : suggestion === "none" ? (
            <p className="hint" style={{ margin: 0 }}>No confident suggestion — pick a tag below, or skip.</p>
          ) : (
            <button
              type="button"
              className="suggest-chip big"
              disabled={busy}
              onClick={() => applyTag(suggestion.tag)}
              title={suggestion.reasons.join(", ")}
            >
              ✨ <TagPill tag={suggestion.tag} /> {suggestion.confidence}% — tap to accept
            </button>
          )}

          <TagPicker value={null} onChange={(t) => t && applyTag(t)} disabled={busy} />

          <div className="scan-actions">
            <button className="btn" disabled={busy} onClick={() => setIdx((i) => i + 1)}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
