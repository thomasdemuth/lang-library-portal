"use client";

import { useEffect, useId, useRef, useState } from "react";
import { checkOut } from "@/lib/checkout-client";
import type { ActionBook, NoteKind } from "@/lib/book-actions-client";
import { withBase } from "@/lib/base";

type Suggestion = { email: string; name: string };

/**
 * "Check out for a student" — the teacher half of circulation, inline in a
 * book's detail card. Type a name or school email; known accounts suggest
 * as you type, and a kid who has never signed in still works because a
 * plain "first last" becomes first.last@students… (the school's pattern).
 */
export default function StaffCheckout({
  book,
  onNote,
}: {
  book: ActionBook;
  onNote: (text: string, kind: NoteKind) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = q.trim();
    if (query.length < 2 || query.includes("@")) {
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(() => {
      fetch(withBase(`/api/students/suggest?q=${encodeURIComponent(query)}`))
        .then((r) => r.json())
        .then((d) => setSuggestions(d.students ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  function resolveEmail(): string {
    const t = q.trim().toLowerCase();
    if (t.includes("@")) return t;
    const asLocal = t.replace(/\s+/g, ".").replace(/[^a-z0-9.-]/g, "");
    const hit = suggestions.find((s) => s.name.toLowerCase() === t || s.email.startsWith(`${asLocal}@`));
    if (hit) return hit.email;
    return asLocal ? `${asLocal}@students.thelangschool.org` : "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = resolveEmail();
    if (!email) return onNote("Who is this book for? Type the student's name or school email.", "warn");
    setBusy(true);
    try {
      const result = await checkOut(book, email);
      if ("error" in result) return onNote(result.error, result.kind);
      onNote([result.message, ...result.warnings].join(" "), result.warnings.length ? "warn" : "ok");
      setOpen(false);
      setQ("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="b-btn" onClick={() => setOpen(true)}>
        Check out for a student
      </button>
    );
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
      <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
        <input
          className="input"
          style={{ width: "100%" }}
          autoFocus
          autoComplete="off"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-label="Student name or school email"
          placeholder="Student name or school email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching students"
            style={{
              listStyle: "none",
              margin: "6px 0 0",
              padding: 4,
              border: "1px solid var(--line, #dcdfe6)",
              borderRadius: 10,
              background: "#fff",
              boxShadow: "0 8px 24px rgba(20,24,40,.10)",
              position: "absolute",
              insetInline: 0,
              zIndex: 20,
            }}
          >
            {suggestions.map((s) => (
              <li key={s.email} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    setQ(s.email);
                    setSuggestions([]);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    font: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="hint" style={{ display: "block", margin: 0 }}>{s.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn brand" type="submit" disabled={busy || q.trim().length < 2}>
        {busy ? "Checking out…" : "Check out"}
      </button>
      <button className="btn" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
