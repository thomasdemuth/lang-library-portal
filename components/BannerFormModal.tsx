"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import BannerBody from "@/components/BannerBody";
import { withBase } from "@/lib/base";
import { AUDIENCES, ICONS, TONES, type BannerRow, type Tone } from "@/lib/banners";

const TONE_LABEL: Record<Tone, string> = {
  info: "Blue — news",
  ok: "Green — good news",
  warn: "Amber — heads-up",
  alert: "Red — important",
};

const ICON_LABEL: Record<string, string> = {
  sparkle: "Sparkle — new or improved",
  megaphone: "Megaphone — announcement",
  bell: "Bell — reminder",
  note: "Note — notice",
  feedback: "Speech bubble — asking",
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  student: "Students only",
  staff: "Teachers only",
};

/** ISO ⇄ the value a datetime-local input wants (local time, no zone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

const MESSAGE_MAX = 300;
/** Past this the strip wraps to a second line on a laptop. */
const MESSAGE_COMFORTABLE = 120;

export default function BannerFormModal({
  banner,
  onClose,
  onSaved,
  onDeleted,
}: {
  banner: BannerRow | null;
  onClose: () => void;
  onSaved: (row: BannerRow) => void;
  onDeleted: (id: number) => void;
}) {
  const isNew = banner === null;

  const [message, setMessage] = useState(banner?.message ?? "");
  const [ctaLabel, setCtaLabel] = useState(banner?.cta_label ?? "");
  const [ctaHref, setCtaHref] = useState(banner?.cta_href ?? "");
  const [guestHref, setGuestHref] = useState(banner?.cta_href_guest ?? "");
  const [audience, setAudience] = useState(banner?.audience ?? "all");
  const [tone, setTone] = useState<Tone>(banner?.tone ?? "info");
  const [icon, setIcon] = useState(banner?.icon ?? "sparkle");
  const [startsAt, setStartsAt] = useState(toLocalInput(banner?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(banner?.ends_at ?? null));
  const [dismissDays, setDismissDays] = useState(String(banner?.dismiss_days ?? 30));
  const [hideWhenAnswered, setHideWhenAnswered] = useState(banner?.hide_when_answered ?? false);
  const [enabled, setEnabled] = useState(banner?.enabled ?? false);
  const [bumpRev, setBumpRev] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    message !== (banner?.message ?? "") ||
    ctaLabel !== (banner?.cta_label ?? "") ||
    ctaHref !== (banner?.cta_href ?? "") ||
    guestHref !== (banner?.cta_href_guest ?? "") ||
    audience !== (banner?.audience ?? "all") ||
    tone !== (banner?.tone ?? "info") ||
    icon !== (banner?.icon ?? "sparkle") ||
    startsAt !== toLocalInput(banner?.starts_at ?? null) ||
    endsAt !== toLocalInput(banner?.ends_at ?? null) ||
    dismissDays !== String(banner?.dismiss_days ?? 30) ||
    hideWhenAnswered !== (banner?.hide_when_answered ?? false) ||
    enabled !== (banner?.enabled ?? false) ||
    bumpRev;

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      message: message.trim(),
      cta_label: ctaLabel.trim() || null,
      cta_href: ctaHref.trim() || null,
      cta_href_guest: guestHref.trim() || null,
      audience,
      tone,
      icon,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      dismiss_days: Number(dismissDays) || 0,
      hide_when_answered: hideWhenAnswered,
      enabled,
      ...(isNew ? {} : { bump_rev: bumpRev }),
    };
    try {
      const res = await fetch(
        withBase(isNew ? "/api/admin/banners" : `/api/admin/banners/${banner!.id}`),
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      onSaved(data.banner as BannerRow);
    } catch {
      setError("Couldn't reach the server — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/admin/banners/${banner!.id}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't delete that.");
        return;
      }
      onDeleted(banner!.id);
    } catch {
      setError("Couldn't reach the server — nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      className="bookedit"
      title={isNew ? "New banner" : "Edit banner"}
    >
      {/* The same component the site renders, so what you see here is exactly
          what students get. */}
      <div style={{ padding: "0 18px 14px" }}>
        <span className="lbl">Preview</span>
        <div className="banner-preview">
          <BannerBody
            banner={{
              message: message.trim() || "Your message goes here",
              ctaLabel: ctaLabel.trim() || null,
              ctaHref: ctaHref.trim() || null,
              tone,
              icon,
              dismissDays: Number(dismissDays) || 0,
            }}
            preview
          />
        </div>
      </div>

      {error && <div className="error" style={{ margin: "0 18px" }}>{error}</div>}

      <div className="bookedit-fields">
        <label className="field">
          <span className="lbl">Message</span>
          <textarea
            className="input"
            rows={2}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We've updated the Lang Library…"
          />
          <span className="hint">
            {message.length}/{MESSAGE_MAX}
            {message.length > MESSAGE_COMFORTABLE
              ? " — long messages wrap onto a second line on a laptop"
              : ""}
          </span>
        </label>

        <div className="bookedit-row">
          <label className="field">
            <span className="lbl">Link words (optional)</span>
            <input
              className="input"
              maxLength={60}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Tell us what you think"
            />
            <span className="hint">The arrow is added for you.</span>
          </label>
          <label className="field">
            <span className="lbl">Link</span>
            <input
              className="input"
              value={ctaHref}
              onChange={(e) => setCtaHref(e.target.value)}
              placeholder="/feedback?src=banner"
            />
            <span className="hint">A page on this site (/…) or an https:// address.</span>
          </label>
        </div>

        <label className="field">
          <span className="lbl">Link for signed-out visitors (optional)</span>
          <input
            className="input"
            value={guestHref}
            onChange={(e) => setGuestHref(e.target.value)}
            placeholder="/hi/site"
          />
          <span className="hint">
            Guests can only reach Find a Book and the Library Map. Leave this blank and guests
            won&rsquo;t be shown the banner at all.
          </span>
        </label>

        <div className="bookedit-row">
          <label className="field">
            <span className="lbl">Who sees it</span>
            <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="lbl">Color</span>
            <select className="input" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="lbl">Icon</span>
            <select className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>
              {ICONS.map((i) => (
                <option key={i} value={i}>
                  {ICON_LABEL[i]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="bookedit-row">
          <label className="field">
            <span className="lbl">Starts</span>
            <input
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <span className="hint">Blank = as soon as it&rsquo;s switched on.</span>
          </label>
          <label className="field">
            <span className="lbl">Ends</span>
            <input
              className="input"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
            <span className="hint">Blank = until you switch it off.</span>
          </label>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>
          Times are in this computer&rsquo;s time zone.
        </p>

        <label className="field">
          <span className="lbl">Hide it for, after someone taps ×</span>
          <input
            className="input"
            type="number"
            min={0}
            max={365}
            value={dismissDays}
            onChange={(e) => setDismissDays(e.target.value)}
            style={{ maxWidth: 140 }}
          />
          <span className="hint">Days. 0 means once someone hides it, it stays hidden.</span>
        </label>

        <label className="check" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={hideWhenAnswered}
            onChange={(e) => setHideWhenAnswered(e.target.checked)}
          />
          Stop showing it to people who have already sent feedback
        </label>

        {!isNew && (
          <label className="check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={bumpRev} onChange={(e) => setBumpRev(e.target.checked)} />
            Show it again to people who dismissed it
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Switched on
        </label>
      </div>

      <div className="modal-actions">
        {!isNew &&
          (confirmDelete ? (
            <span className="modal-confirm">
              <button className="btn danger" onClick={remove} disabled={busy}>
                Delete for good
              </button>
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button className="btn modal-delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn brand" onClick={save} disabled={busy || !message.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
