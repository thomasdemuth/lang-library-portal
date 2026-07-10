"use client";

import { useState } from "react";

export default function FeedbackForm({ audience }: { audience: "student" | "staff" }) {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Couldn't send that — try again." });
        return;
      }
      setMsg({ ok: true, text: "Sent! The library team reads everything. Thank you." });
      setMessage("");
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      <div className="field">
        <label className="lbl" htmlFor="fb">
          {audience === "student" ? "What's on your mind?" : "Your feedback"}
        </label>
        <textarea
          id="fb"
          className="input"
          required
          minLength={3}
          maxLength={4000}
          rows={5}
          placeholder={
            audience === "student"
              ? "A book you wish we had, something that's hard to find, an idea…"
              : "Requests, ideas, issues — anything for the library team."
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="fbname">
          Your name <span style={{ fontWeight: 500, textTransform: "none" }}>(optional)</span>
        </label>
        <input
          id="fbname"
          className="input"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button className="btn primary" disabled={busy}>
        {busy ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
