"use client";

import { useState } from "react";

export default function ProfileForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = name.trim() !== initialName && name.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Couldn't update your name." });
        return;
      }
      setMsg({ ok: true, text: "Display name updated." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420 }}>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      <div className="field">
        <label className="lbl">Display name</label>
        <input
          className="input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ms. Okafor"
        />
      </div>
      <button className="btn primary" disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
