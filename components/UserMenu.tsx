"use client";

import { useEffect, useRef, useState } from "react";
import AvatarView from "@/components/AvatarView";
import { DEFAULT_AVATAR, displayNameFull, type Avatar } from "@/lib/play";
import { Ic } from "@/components/icons";

/**
 * The top-right identity chip: the person's real name (school emails are
 * first.last) and — on the student site — the avatar they built. Clicking
 * opens a little account menu (profile privacy, sign out).
 */
export default function UserMenu({ email, audience }: { email: string; audience: "student" | "staff" }) {
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (audience !== "student") return;
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setAvatar({ ...DEFAULT_AVATAR, ...d.profile.avatar });
          setHidden(Boolean(d.profile.hidden));
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
        {audience === "student" ? (
          <AvatarView avatar={avatar} size={30} />
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
              <a className="usermenu-item" href="/avatar">
                <Ic name="sparkle" size={15} /> Avatar Studio
              </a>
              <button type="button" className="usermenu-item" onClick={togglePrivacy}>
                <Ic name="feedback" size={15} />
                {hidden ? "Show my profile" : "Hide my profile"}
                <span className={`usermenu-state${hidden ? " off" : ""}`}>{hidden ? "hidden" : "visible"}</span>
              </button>
            </>
          )}
          <button type="button" className="usermenu-item danger" onClick={signOut}>
            <Ic name="gear" size={15} /> Sign out
          </button>
          {note && <div className="usermenu-note">{note}</div>}
        </div>
      )}
    </div>
  );
}
