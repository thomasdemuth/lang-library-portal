"use client";

import { useEffect, useState } from "react";
import { withBase } from "@/lib/base";
import { TEACHERS_COLOR } from "@/lib/categories";

type Book = { id: number; title: string; isbn13: string | null; dedupe_key: string };

const SHOWN = 12;

/**
 * A glance at the teachers-only collection for the staff portal home.
 *
 * Deliberately read-only covers rather than the student home's BookRow: that
 * component carries "I read this" and favorites, which are student
 * machinery. Renders nothing at all when the collection is empty, so a
 * library that doesn't use the tag never sees a dead section.
 */
export default function TeacherPicks() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(withBase("/api/catalog?teachers=only"))
      .then((r) => (r.ok ? r.json() : { books: [] }))
      .then((d) => setBooks((d.books ?? []).filter((b: Book) => b.isbn13)))
      .catch(() => setBooks([]));
  }, []);

  const visible = (books ?? []).filter((b) => !hidden.has(b.id)).slice(0, SHOWN);
  if (books === null || visible.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h2>
        <span className="dot" style={{ background: TEACHERS_COLOR }} />
        Books for Teachers
      </h2>
      <p>Kept out of the students&rsquo; library — yours to browse.</p>
      <div className="teachershelf">
        {visible.map((b) => (
          <a key={b.id} href={withBase("/books-for-teachers")} className="teacherpick" title={b.title}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBase(`/api/catalog/cover?isbn=${b.isbn13}`)}
              alt={b.title}
              loading="lazy"
              onError={() => setHidden((cur) => new Set(cur).add(b.id))}
            />
          </a>
        ))}
        <a href={withBase("/books-for-teachers")} className="teacherpick teacherpick-all">
          See all &rarr;
        </a>
      </div>
    </div>
  );
}
