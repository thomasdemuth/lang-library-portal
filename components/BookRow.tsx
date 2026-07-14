"use client";

import { useEffect, useState } from "react";
import type { CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; dedupe_key: string; tag: CategoryId | null };

/**
 * One horizontal shelf of covers. Books whose cover fails to load are
 * dropped from the row entirely (this page is a cover gallery). Each
 * card links into search; the ⭐ button logs "I read this".
 */
export default function BookRow({
  title,
  emoji,
  kind,
  tag,
  onPoints,
}: {
  title: string;
  emoji: string;
  kind: "new" | "random" | "tag";
  tag?: CategoryId;
  onPoints?: (points: number) => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/catalog/row?kind=${kind}${tag ? `&tag=${tag}` : ""}`)
      .then((r) => r.json())
      .then((d) => setBooks((d.books ?? []).filter((b: Book) => b.isbn13)))
      .catch(() => {});
  }, [kind, tag]);

  async function markRead(e: React.MouseEvent, b: Book) {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/play/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_key: b.dedupe_key, title: b.title }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLogged((cur) => new Set(cur).add(b.dedupe_key));
      setToast(`+${data.earned} ⭐ Nice reading!`);
      onPoints?.(data.points);
    } else {
      setToast(data.error ?? "Couldn't log that one.");
    }
    setTimeout(() => setToast(null), 2600);
  }

  const visible = books.filter((b) => !hidden.has(b.id));
  if (books.length > 0 && visible.length === 0) return null;

  return (
    <div className="newshelf">
      <h2>
        <span className="newshelf-spark">{emoji}</span> {title}
        {toast && <span className="row-toast">{toast}</span>}
      </h2>
      <div className="newshelf-row">
        {visible.map((b) => (
          <a key={b.id} className="newshelf-card" href={`/search?q=${encodeURIComponent(b.title)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/catalog/cover?isbn=${b.isbn13}`}
              alt=""
              loading="lazy"
              onError={() => setHidden((cur) => new Set(cur).add(b.id))}
            />
            <span className="newshelf-title">{b.title}</span>
            <span className="newshelf-foot">
              {b.tag && <TagPill tag={b.tag} small />}
              <button
                type="button"
                className={`read-btn${logged.has(b.dedupe_key) ? " done" : ""}`}
                onClick={(e) => markRead(e, b)}
                title="I read this — earn stars!"
              >
                {logged.has(b.dedupe_key) ? "✓ logged" : "⭐ I read this"}
              </button>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
