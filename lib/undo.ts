"use client";

/**
 * A tiny app-wide undo/redo stack, driven by ⌘Z / ⌘⇧Z (see
 * components/Shortcuts.tsx). Panels register an entry when they do
 * something reversible; the entry carries both directions so a step can
 * be replayed after it's undone.
 *
 * Entries are in-memory only: a page load starts with a clean history,
 * which is deliberate — an undo that fires against a stale server state
 * would be worse than no undo at all.
 */

export type UndoEntry = {
  /** Past tense, for the toast: "Tagged “Holes” → Fiction". */
  label: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
};

const LIMIT = 40;

let undoStack: UndoEntry[] = [];
let redoStack: UndoEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function onUndoChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Record a completed action. Doing something new voids the redo branch. */
export function pushUndo(entry: UndoEntry): void {
  undoStack = [...undoStack.slice(-(LIMIT - 1)), entry];
  redoStack = [];
  notify();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** Undo the newest action. Resolves to its label, or null if nothing/failed. */
export async function runUndo(): Promise<string | null> {
  const entry = undoStack[undoStack.length - 1];
  if (!entry) return null;
  undoStack = undoStack.slice(0, -1);
  notify();
  try {
    await entry.undo();
  } catch {
    undoStack = [...undoStack, entry]; // put it back; nothing changed
    notify();
    return null;
  }
  redoStack = [...redoStack, entry];
  notify();
  return entry.label;
}

/** Redo the most recently undone action. */
export async function runRedo(): Promise<string | null> {
  const entry = redoStack[redoStack.length - 1];
  if (!entry) return null;
  redoStack = redoStack.slice(0, -1);
  notify();
  try {
    await entry.redo();
  } catch {
    redoStack = [...redoStack, entry];
    notify();
    return null;
  }
  undoStack = [...undoStack, entry];
  notify();
  return entry.label;
}

/** Drop the history — panels call this when they unmount. */
export function clearUndo(): void {
  undoStack = [];
  redoStack = [];
  notify();
}
