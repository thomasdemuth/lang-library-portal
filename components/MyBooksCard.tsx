"use client";

import { useEffect, useState } from "react";
import { Ic } from "@/components/icons";
import { announce } from "@/components/Announcer";
import { myCheckouts, returnCheckout, type MyCheckout } from "@/lib/checkout-client";
import { dueLabel, isOverdue } from "@/lib/circulation";
import { fireConfetti } from "@/lib/confetti";
import { refreshBadges } from "@/lib/badges-client";
import { withBase } from "@/lib/base";

/**
 * "Books I have out" on My Page: what's checked out to me, when it's due,
 * and the tap that gives it back. Hidden entirely until the student has
 * (or has ever had) a checkout — no empty nag for kids who only read here.
 */
export default function MyBooksCard() {
  const [open, setOpen] = useState<MyCheckout[] | null>(null);
  const [everBorrowed, setEverBorrowed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const result = await myCheckouts();
    if ("error" in result) return;
    setOpen(result.open);
    setEverBorrowed(result.open.length > 0 || result.returned.length > 0);
  }
  useEffect(() => {
    load();
  }, []);

  async function giveBack(c: MyCheckout) {
    setBusy(c.id);
    try {
      const result = await returnCheckout(c.id);
      const text = "error" in result ? result.error : result.message;
      setMsg(text);
      announce(text, "error" in result && result.kind === "err");
      if (!("error" in result)) {
        fireConfetti(50);
        refreshBadges(); // bringing one back earns Safe Return
      }
      setTimeout(() => setMsg((cur) => (cur === text ? null : cur)), 3200);
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!open || (!everBorrowed && open.length === 0)) return null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>
        <Ic name="backpack" size={16} /> Books I have out{open.length > 0 ? ` · ${open.length}` : ""}
      </h2>
      {msg && (
        <p className="hint" role="status" style={{ marginTop: 6 }}>
          {msg}
        </p>
      )}
      {open.length === 0 ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          Nothing out right now — tap “Check out” on any book when you take it home.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {open.map((c) => {
            const overdue = isOverdue(c.due_at);
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={withBase(`/search?q=${encodeURIComponent(c.title)}`)}
                    style={{ fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                  >
                    {c.title}
                  </a>
                  <span
                    className="hint"
                    style={{ display: "block", margin: 0, color: overdue ? "#8f1b23" : undefined, fontWeight: overdue ? 600 : undefined }}
                  >
                    {dueLabel(c.due_at)}
                  </span>
                </span>
                <button type="button" className="btn" disabled={busy === c.id} onClick={() => giveBack(c)}>
                  {busy === c.id ? "…" : "I returned it"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
