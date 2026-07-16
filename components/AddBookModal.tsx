"use client";

import { useState } from "react";
import { type CategoryId } from "@/lib/categories";
import TagPicker from "@/components/TagPicker";
import CopyStepper from "@/components/CopyStepper";

/** A freshly-added catalog row (shape the inventory list expects). */
export type AddedBook = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  copies: number;
  group_name: string | null;
  dedupe_key: string;
  tag: CategoryId | null;
};

/**
 * Add a single new title to the live catalog (manual entry, not Libib).
 * Posts to /api/admin/books/add, then applies the chosen tag. Additions
 * live until the next Libib import re-baselines the generation.
 */
export default function AddBookModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (book: AddedBook, wasNew: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [creators, setCreators] = useState("");
  const [isbn13, setIsbn13] = useState("");
  const [isbn10, setIsbn10] = useState("");
  const [copies, setCopies] = useState(1);
  const [tag, setTag] = useState<CategoryId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverIsbn = isbn13.trim() || isbn10.trim();

  async function add() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/books/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          creators: creators.trim() || null,
          isbn13: isbn13.trim() || null,
          isbn10: isbn10.trim() || null,
          copies,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.book) {
        setError(data.error ?? "Couldn't add that title.");
        return;
      }
      const book = data.book as AddedBook;
      // Tag lives in book_tags (keyed by dedupe_key), applied after insert.
      if (tag) {
        const tagRes = await fetch("/api/admin/books/tag", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ book_key: book.dedupe_key, category: tag }),
        });
        if (tagRes.ok) book.tag = tag;
      }
      onAdded(book, Boolean(data.added));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal bookedit" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Add a title</b>
          <button className="scan-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bookedit-body">
          <div className="bookedit-cover">
            {coverIsbn ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/books/cover?isbn=${encodeURIComponent(coverIsbn)}`}
                alt=""
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
            ) : (
              <div className="bookedit-nocover">No cover</div>
            )}
            <span className="hint" style={{ textAlign: "center" }}>Cover follows the ISBN</span>
          </div>

          <div className="bookedit-fields">
            <label className="field">
              <span className="lbl">Title</span>
              <input className="input" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Wild Robot" />
            </label>
            <label className="field">
              <span className="lbl">Author(s)</span>
              <input className="input" value={creators} onChange={(e) => setCreators(e.target.value)} placeholder="e.g. Brown, Peter" />
            </label>
            <div className="bookedit-row">
              <label className="field" style={{ flex: 2 }}>
                <span className="lbl">ISBN-13</span>
                <input className="input" value={isbn13} onChange={(e) => setIsbn13(e.target.value)} inputMode="numeric" />
              </label>
              <label className="field" style={{ flex: 2 }}>
                <span className="lbl">ISBN-10</span>
                <input className="input" value={isbn10} onChange={(e) => setIsbn10(e.target.value)} />
              </label>
              <div className="field" style={{ flex: "none" }}>
                <span className="lbl">Copies</span>
                <CopyStepper value={copies} onChange={setCopies} disabled={busy} />
              </div>
            </div>
            <div className="field">
              <span className="lbl">Tag</span>
              <TagPicker value={tag} onChange={setTag} />
            </div>
          </div>
        </div>

        {error && <div className="error" style={{ margin: "0 18px" }}>{error}</div>}
        <p className="hint" style={{ margin: "0 18px" }}>
          Adds {copies === 1 ? "one copy" : `${copies} copies`} to the live catalog. If this title's
          already here, its copies go up by {copies} instead. Manual additions last until the next
          Libib import.
        </p>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn brand" onClick={add} disabled={busy || !title.trim()}>
            {busy ? "Adding…" : "Add title"}
          </button>
        </div>
      </div>
    </div>
  );
}
