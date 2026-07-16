"use client";

import { useEffect, useState } from "react";
import AvatarView from "@/components/AvatarView";
import AvatarPart from "@/components/AvatarParts";
import { Star } from "@/components/icons";
import { CORE_SLOTS, normalizeAvatar, ownsItem, type Avatar, type AvatarItem, type Slot } from "@/lib/play";

type Profile = { avatar: Avatar; owned: string[]; points: number };

const SLOT_TABS: { slot: Slot; label: string }[] = [
  { slot: "bg", label: "Background" },
  { slot: "head", label: "Head" },
  { slot: "body", label: "Body" },
  { slot: "legs", label: "Legs" },
  { slot: "outfit", label: "Outfits" },
  { slot: "face", label: "Face" },
  { slot: "hat", label: "Hats" },
];

/** One item thumbnail: emoji, color swatch, SVG part, or PNG. */
function ItemArt({ item }: { item: AvatarItem }) {
  if (item.emoji) return <span className="shop-emoji">{item.emoji}</span>;
  if (item.color) return <span className="shop-swatch" style={{ background: item.color }} />;
  if (item.part)
    return (
      <span className="shop-part">
        <AvatarPart id={item.part} />
      </span>
    );
  if (item.src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="shop-png" src={item.src} alt="" />;
  return null;
}

/**
 * The Avatar Studio: a live layered preview plus the full wardrobe,
 * organized by slot. Tap to buy (with stars), tap to wear; extras
 * (outfits, face, hats) tap off again. /me stays for collections.
 */
export default function AvatarStudio() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<AvatarItem[]>([]);
  const [tab, setTab] = useState<Slot>("head");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [migration, setMigration] = useState(false);

  useEffect(() => {
    fetch("/api/play/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.migrationPending) setMigration(true);
        if (d.profile) {
          setProfile(d.profile);
          setCatalog(d.catalog ?? []);
        }
      })
      .catch(() => {});
  }, []);

  function say(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2600);
  }

  async function tapItem(item: AvatarItem) {
    if (!profile) return;
    const owned = ownsItem(profile.owned, item);
    if (!owned) {
      const res = await fetch("/api/play/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", id: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(false, data.error ?? "Couldn't buy that.");
        return;
      }
      setProfile((cur) => (cur ? { ...cur, owned: data.owned, points: data.points } : cur));
      say(true, `${item.label} is yours!`);
      // fall through to wear it right away
    }
    const equipped = normalizeAvatar(profile.avatar)[item.slot] === item.id;
    if (equipped && CORE_SLOTS.includes(item.slot)) return; // core parts swap, never come off
    const res = await fetch("/api/play/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "equip", slot: item.slot, id: equipped ? null : item.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setProfile((cur) => (cur ? { ...cur, avatar: data.avatar } : cur));
    else if (!equipped) say(false, data.error ?? "Couldn't equip that.");
  }

  if (migration)
    return (
      <div className="wrap student-theme">
        <h1>Avatar Studio</h1>
        <div className="notice">The studio opens after the next library update — check back soon!</div>
      </div>
    );

  if (!profile)
    return (
      <div className="wrap student-theme">
        <p className="hint" style={{ padding: 30 }}>Opening the studio…</p>
      </div>
    );

  const worn = normalizeAvatar(profile.avatar);

  return (
    <div className="wrap student-theme">
      <h1>Avatar Studio</h1>
      <p className="sub">Mix and match a look — read books to earn stars for new parts.</p>

      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}

      <div className="studio">
        <div className="studio-preview card">
          <AvatarView avatar={profile.avatar} size={210} />
          <p className="studio-points">
            <Star size={15} /> {profile.points} stars to spend
          </p>
          <a className="play-cta" href="/me">Back to My Page →</a>
        </div>

        <div className="studio-wardrobe card">
          <div className="studio-tabs" role="tablist">
            {SLOT_TABS.map((t) => (
              <button
                key={t.slot}
                type="button"
                role="tab"
                aria-selected={tab === t.slot}
                className={`tagchip${tab === t.slot ? " active" : ""}`}
                onClick={() => setTab(t.slot)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="shop-grid">
            {catalog
              .filter((i) => i.slot === tab)
              .map((item) => {
                const owned = ownsItem(profile.owned, item);
                const equipped = worn[item.slot] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`shop-item${equipped ? " equipped" : ""}${owned ? "" : " locked"}`}
                    onClick={() => tapItem(item)}
                    title={
                      owned
                        ? equipped
                          ? CORE_SLOTS.includes(item.slot)
                            ? "Wearing"
                            : "Tap to take off"
                          : "Tap to wear"
                        : `Costs ${item.price} stars`
                    }
                  >
                    <ItemArt item={item} />
                    <span className="shop-label">{item.label}</span>
                    <span className="shop-price">
                      {owned ? (equipped ? "wearing" : "owned") : (
                        <>
                          {item.price} <Star size={11} />
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
