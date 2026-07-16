"use client";

import { useEffect, useState } from "react";
import { Check, Ic } from "@/components/icons";
import {
  type ClientCollection,
  type CollectBook,
  addToCollection,
  collectionCountFor,
  collectionsMigrationPending,
  createCollection,
  getCollections,
  onCollectionsChange,
  removeFromCollection,
} from "@/lib/collections-client";

/**
 * "Add to list" button for any book card. Opens a small modal listing the
 * student's collections (tap to toggle the book in/out) with an inline
 * "new list" creator — so books can be filed straight from search or the
 * discovery shelves, and new collections started right there.
 */
export default function AddToCollection({ book, compact }: { book: CollectBook; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0); // re-render on shared-cache changes

  useEffect(() => onCollectionsChange(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    getCollections().then(() => setTick((n) => n + 1));
  }, []);

  const count = collectionCountFor(book.book_key);

  return (
    <>
      <button
        type="button"
        className={`b-btn b-collect${count > 0 ? " on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Add this book to one of your lists"
      >
        <Ic name="folder" size={13} />
        {compact ? "List" : count > 0 ? `In ${count} list${count === 1 ? "" : "s"}` : "Add to list"}
      </button>
      {open && <CollectModal book={book} onClose={() => setOpen(false)} />}
    </>
  );
}

function CollectModal({ book, onClose }: { book: CollectBook; onClose: () => void }) {
  const [collections, setCollections] = useState<ClientCollection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const migration = collectionsMigrationPending();

  useEffect(() => {
    getCollections().then(setCollections);
    return onCollectionsChange(() => getCollections().then((c) => setCollections([...c])));
  }, []);

  async function toggle(col: ClientCollection) {
    setErr(null);
    setBusy(col.id);
    const inList = col.bookKeys.includes(book.book_key);
    const res = inList ? await removeFromCollection(col.id, book.book_key) : await addToCollection(col.id, book);
    setBusy(null);
    if ("error" in res) setErr(res.error);
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setErr(null);
    setBusy("new");
    const res = await createCollection(name, book);
    setBusy(null);
    if ("error" in res) setErr(res.error);
    else setNewName("");
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal collect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Add to a list</b>
          <button type="button" className="scan-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="collect-body">
          <p className="hint" style={{ marginTop: 0 }}>
            “{book.title}”
          </p>

          {err && <div className="error">{err}</div>}

          {migration ? (
            <p className="hint">Collections unlock after the next library update — check back soon!</p>
          ) : (
            <>
              {collections === null ? (
                <p className="hint">Loading your lists…</p>
              ) : collections.length === 0 ? (
                <p className="hint">No lists yet — make your first one below.</p>
              ) : (
                <div className="collect-list">
                  {collections.map((col) => {
                    const inList = col.bookKeys.includes(book.book_key);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        className={`collect-opt${inList ? " on" : ""}`}
                        onClick={() => toggle(col)}
                        disabled={busy === col.id}
                      >
                        <span className={`collect-check${inList ? " on" : ""}`}>
                          {inList && <Check done size={13} />}
                        </span>
                        <b>{col.name}</b>
                        <span className="hint" style={{ margin: 0 }}>
                          {col.bookKeys.length} book{col.bookKeys.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="collect-new">
                <input
                  className="input"
                  placeholder="New list — “Dragons”, “Summer reads”…"
                  value={newName}
                  maxLength={40}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                />
                <button type="button" className="btn" onClick={create} disabled={!newName.trim() || busy === "new"}>
                  Create &amp; add
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
