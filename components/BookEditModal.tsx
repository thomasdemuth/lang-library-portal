"use client";

import { useState } from "react";
import { type CategoryId } from "@/lib/categories";
import TagPicker from "@/components/TagPicker";
import CopyStepper, { clampCopies } from "@/components/CopyStepper";

export type EditableBook = {
  id: number;
  title: string;
  creators: string | null;
  isbn13: string | null;
  isbn10: string | null;
  copies: number;
  description: string | null;
  notes: string | null;
  tag: CategoryId | null;
  dedupe_key: string;
};

/**
 * Edit a catalog entry's properties. Saves the book fields via
 * PATCH /api/admin/books/[id] and the tag via the tag API. The cover is
 * whatever the ISBN resolves to, so it previews live as the ISBN changes.
 * Field edits last until the next Libib import (its CSV is the source of
 * truth); the tag persists.
 */
export default function BookEditModal({
  book,
  onClose,
  onSaved,
  onDeleted,
}: {
  book: EditableBook;
  onClose: () => void;
  onSaved: (updated: EditableBook) => void;
  onDeleted: (id: number) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [creators, setCreators] = useState(book.creators ?? "");
  const [isbn13, setIsbn13] = useState(book.isbn13 ?? "");
  const [isbn10, setIsbn10] = useState(book.isbn10 ?? "");
  const [copies, setCopies] = useState(clampCopies(book.copies));
  const [description, setDescription] = useState(book.description ?? "");
  const [notes, setNotes] = useState(book.notes ?? "");
  const [tag, setTag] = useState<CategoryId | null>(book.tag);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverIsbn = isbn13.trim() || isbn10.trim();

  async function save() {
    const copyNum = clampCopies(copies);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            title: title.trim() || book.title,
            creators: creators.trim() || null,
            isbn13: isbn13.trim() || null,
            isbn10: isbn10.trim() || null,
            description: description.trim() || null,
            notes: notes.trim() || null,
            copies: copyNum,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      // Tag lives in book_tags (keyed by dedupe_key), saved separately.
      if (tag !== book.tag) {
        const tagRes = await fetch("/api/admin/books/tag", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ book_key: book.dedupe_key, category: tag }),
        });
        if (!tagRes.ok) {
          setError((await tagRes.json().catch(() => ({}))).error ?? "Saved the book, but the tag didn't stick.");
          return;
        }
      }
      onSaved({
        ...book,
        title: title.trim() || book.title,
        creators: creators.trim() || null,
        isbn13: isbn13.trim() || null,
        isbn10: isbn10.trim() || null,
        copies: copyNum,
        description: description.trim() || null,
        notes: notes.trim() || null,
        tag,
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/books/${book.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
        return;
      }
      onDeleted(book.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal bookedit" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Edit book</b>
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
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span className="lbl">Author(s)</span>
              <input className="input" value={creators} onChange={(e) => setCreators(e.target.value)} placeholder="e.g. Kinney, Jeff" />
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
            <label className="field">
              <span className="lbl">Description</span>
              <textarea className="input" style={{ minHeight: 90 }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="field">
              <span className="lbl">Internal notes (staff only)</span>
              <textarea className="input" style={{ minHeight: 56 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </div>

        {error && <div className="error" style={{ margin: "0 18px" }}>{error}</div>}
        <p className="hint" style={{ margin: "0 18px" }}>
          Heads up: edits here last until the next Libib import, which re-baselines every field. The tag persists.
        </p>

        <div className="modal-actions">
          {confirmDelete ? (
            <span className="modal-confirm">
              <span className="hint" style={{ margin: 0 }}>Delete this book?</span>
              <button className="btn danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Yes, delete"}</button>
              <button className="btn ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>No</button>
            </span>
          ) : (
            <button className="btn ghost modal-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete book
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn brand" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
