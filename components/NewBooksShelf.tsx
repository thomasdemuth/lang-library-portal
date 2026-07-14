"use client";

import { useEffect, useRef, useState } from "react";
import type { CategoryId } from "@/lib/categories";
import { TagPill } from "@/components/TagPicker";

type Book = { id: number; title: string; creators: string | null; isbn13: string | null; tag: CategoryId | null };

/**
 * "New on the shelves": an auto-rotating cover carousel. Advances every
 * few seconds, pauses while the reader is touching or hovering it, and
 * each card jumps into the catalog search for that title.
 */
export default function NewBooksShelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    fetch("/api/catalog/new")
      .then((r) => r.json())
      .then((d) => setBooks((d.books ?? []).filter((b: Book) => b.isbn13)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (books.length < 4) return;
    const el = scroller.current;
    if (!el) return;
    const timer = setInterval(() => {
      if (paused.current || !el) return;
      const step = 168; // one card + gap
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, 3500);
    return () => clearInterval(timer);
  }, [books.length]);

  if (books.length === 0) return null;

  return (
    <div className="newshelf">
      <h2>
        <span className="newshelf-spark">✨</span> New on the shelves
      </h2>
      <div
        ref={scroller}
        className="newshelf-row"
        onPointerEnter={() => (paused.current = true)}
        onPointerLeave={() => (paused.current = false)}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
      >
        {books.map((b) => (
          <a key={b.id} className="newshelf-card" href={`/search?q=${encodeURIComponent(b.title)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/catalog/cover?isbn=${b.isbn13}`}
              alt=""
              loading="lazy"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement?.classList.add("no-cover");
              }}
            />
            <span className="newshelf-title">{b.title}</span>
            {b.tag && <TagPill tag={b.tag} small />}
          </a>
        ))}
      </div>
    </div>
  );
}
