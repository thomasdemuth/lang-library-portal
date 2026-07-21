"use client";

import { useState } from "react";
import CopyStepper, { clampCopies } from "@/components/CopyStepper";
import { GAME_SUBCATEGORIES, GAME_SUBCATEGORY_IDS, type Game, type GameSubcategory } from "@/lib/games";

/**
 * Add or edit a game. Mirrors BookEditModal's layout/patterns. `game` null
 * means "add new". Saves via POST/PATCH /api/admin/games and can delete.
 */
export default function GameFormModal({
  game,
  onClose,
  onSaved,
  onDeleted,
}: {
  game: Game | null;
  onClose: () => void;
  onSaved: (g: Game) => void;
  onDeleted: (id: number) => void;
}) {
  const isNew = game === null;
  const [title, setTitle] = useState(game?.title ?? "");
  const [subcategory, setSubcategory] = useState<GameSubcategory>(game?.subcategory ?? "other");
  const [description, setDescription] = useState(game?.description ?? "");
  const [imageUrl, setImageUrl] = useState(game?.image_url ?? "");
  const [copies, setCopies] = useState(clampCopies(game?.copies ?? 1));
  const [condition, setCondition] = useState(game?.condition ?? "");
  const [location, setLocation] = useState(game?.location ?? "");
  const [available, setAvailable] = useState(game?.available ?? true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return setError("Enter a title.");
    setBusy(true);
    setError(null);
    const payload = {
      title: title.trim(),
      subcategory,
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      copies: clampCopies(copies),
      condition: condition.trim() || null,
      location: location.trim() || null,
      available,
    };
    try {
      const res = await fetch(isNew ? "/api/admin/games" : `/api/admin/games/${game!.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't save.");
      onSaved(data.game as Game);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/games/${game.id}`, { method: "DELETE" });
      if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
      onDeleted(game.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal bookedit" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{isNew ? "Add a game" : "Edit game"}</b>
          <button className="scan-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bookedit-fields" style={{ padding: "0 18px" }}>
          <label className="field">
            <span className="lbl">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Uno" />
          </label>
          <div className="bookedit-row">
            <label className="field" style={{ flex: 2 }}>
              <span className="lbl">Sub-category</span>
              <select className="input" value={subcategory} onChange={(e) => setSubcategory(e.target.value as GameSubcategory)}>
                {GAME_SUBCATEGORY_IDS.map((id) => (
                  <option key={id} value={id}>{GAME_SUBCATEGORIES[id].label}</option>
                ))}
              </select>
            </label>
            <div className="field" style={{ flex: "none" }}>
              <span className="lbl">Copies</span>
              <CopyStepper value={copies} onChange={setCopies} disabled={busy} />
            </div>
          </div>
          <div className="bookedit-row">
            <label className="field" style={{ flex: 1 }}>
              <span className="lbl">Condition</span>
              <input className="input" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Good" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="lbl">Location</span>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Games shelf" />
            </label>
          </div>
          <label className="field">
            <span className="lbl">Image URL</span>
            <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
          <label className="check">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            Available to borrow
          </label>
          <label className="field">
            <span className="lbl">Description</span>
            <textarea className="input" style={{ minHeight: 90 }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        {error && <div className="error" style={{ margin: "0 18px" }}>{error}</div>}

        <div className="modal-actions">
          {!isNew && (
            confirmDelete ? (
              <span className="modal-confirm">
                <span className="hint" style={{ margin: 0 }}>Delete this game?</span>
                <button className="btn danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Yes, delete"}</button>
                <button className="btn ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>No</button>
              </span>
            ) : (
              <button className="btn ghost modal-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete game</button>
            )
          )}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn brand" onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Add game" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
