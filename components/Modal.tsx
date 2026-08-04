"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Shared accessible dialog. Renders the existing .modal-scrim/.modal classes
 * (so current modal CSS applies unchanged) with the behavior the audit asks
 * for: role="dialog" + aria-modal, focus moves into the dialog on open,
 * Tab/Shift-Tab are trapped, Escape closes, focus returns to the opener on
 * close, and the scrim click closes. When `dirty` is set, every dismissal
 * path (scrim, Escape, ✕) first asks "Discard what you've typed?" so a stray
 * tap can't eat a half-filled form. Explicit buttons inside `children`
 * (Cancel/Save) call `onClose` themselves and are not guarded.
 *
 * Pass `title` to get the standard `.modal-head` (bold title + ✕ button) with
 * aria-labelledby wired up automatically; or pass `labelledBy` pointing at an
 * id inside `children` and render your own head. `className` is appended to
 * ".modal" for the size variants ("bookedit", "collect-modal", …).
 *
 * Existing modals render in-tree (no portal), so this does too.
 */
export default function Modal({
  open,
  onClose,
  labelledBy,
  title,
  children,
  dirty,
  className,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  title?: string;
  children: React.ReactNode;
  dirty?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The opener has to be captured while RENDERING, not in the effect below: a
  // child with autoFocus (AddBookModal's title field) takes focus during the
  // same commit, so by the time a passive effect runs document.activeElement
  // is already inside the dialog — and "return focus to the opener" would
  // hand focus to an element that is about to be unmounted, i.e. to <body>.
  const openerRef = useRef<HTMLElement | null>(null);
  if (open && !openerRef.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  // Refs so the stable keydown/close handlers always see current props.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function requestClose() {
    if (dirtyRef.current && !confirm("Discard what you've typed?")) return;
    onCloseRef.current();
  }

  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (box) {
      // Land on the heading if we rendered one, else the first focusable.
      const heading = box.querySelector<HTMLElement>("[data-modal-title]");
      (heading ?? firstFocusable(box) ?? box).focus();
    }
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      // A detached opener (the button that opened this dialog was removed by
      // the very action that closed it) can't take focus — don't pretend.
      if (opener && opener.isConnected) opener.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== "Tab") return;
    const box = boxRef.current;
    if (!box) return;
    const focusables = allFocusable(box);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-scrim" onClick={requestClose}>
      <div
        ref={boxRef}
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {title && (
          <div className="modal-head">
            <b id={titleId} data-modal-title tabIndex={-1}>{title}</b>
            <button className="scan-close" onClick={requestClose} aria-label="Close">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function allFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  return allFocusable(root)[0] ?? null;
}
