"use client";

import { useEffect, useRef, useState } from "react";
import LetterAvatar from "@/components/LetterAvatar";
import { displayNameFull } from "@/lib/play";
import { Ic } from "@/components/icons";

/**
 * The top-right identity chip: the person's real name (school emails are
 * first.last) with their Google profile photo (or an initial-letter avatar).
 * Clicking opens a little account menu (profile privacy, sign out).
 * Students' photos come from their profile row (fetched below); staff have
 * no profile row, so theirs arrives via the `photoUrl` prop (session cookie).
 */
export default function UserMenu({
  email,
  audience,
  photoUrl,
}: {
  email: string;
  audience: "student" | "staff";
  photoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [photo, setPhoto] = useState<string | null>(photoUrl ?? null);
  const [note, setNote] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (audience !== "student") return;
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setHidden(Boolean(d.profile.hidden));
          if (d.profile.photo_url) setPhoto(d.profile.photo_url);
        }
      })
      .catch(() => {});
  }, [audience]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function togglePrivacy() {
    const next = !hidden;
    const res = await fetch("/api/play/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "privacy", hidden: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setHidden(next);
      setNote(next ? "Your profile is now hidden from other students." : "Your profile is visible again.");
    } else {
      setNote(data.error ?? "Couldn't change that.");
    }
    setTimeout(() => setNote(null), 3200);
  }

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/gate";
    }
  }

  const name = displayNameFull(email);

  return (
    <div className="usermenu" ref={boxRef}>
      <button
        type="button"
        className="usermenu-chip"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={email}
      >
        {audience === "student" || photo ? (
          <LetterAvatar name={name} size={30} src={photo ?? undefined} />
        ) : (
          <span className="usermenu-plain">
            <Ic name="users" size={15} />
          </span>
        )}
        <span className="usermenu-name">{name}</span>
      </button>

      {open && (
        <div className="usermenu-pop">
          <div className="usermenu-head">
            <b>{name}</b>
            <span>{email}</span>
          </div>
          {audience === "student" && (
            <>
              <a className="usermenu-item" href="/me">
                <Ic name="smile" size={15} /> My Page
              </a>
              <button type="button" className="usermenu-item" onClick={togglePrivacy}>
                <Ic name={hidden ? "eye" : "eyeoff"} size={15} />
                {hidden ? "Show my profile" : "Hide my profile"}
                <span className={`usermenu-state${hidden ? " off" : ""}`}>{hidden ? "hidden" : "visible"}</span>
              </button>
            </>
          )}
          <button type="button" className="usermenu-item danger" onClick={signOut}>
            <Ic name="exit" size={15} /> Sign out
          </button>
          {note && <div className="usermenu-note">{note}</div>}
        </div>
      )}
    </div>
  );
}
