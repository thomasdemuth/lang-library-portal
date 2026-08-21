"use client";

/**
 * Client half of circulation: check a book out (as yourself, or — for
 * teachers — for a student) and mark one returned. Mirrors the style of
 * lib/book-actions-client.
 */
import { OFFLINE_MESSAGE, sessionExpired, type ActionBook, type NoteKind } from "./book-actions-client";
import { withBase } from "./base";

export type CheckoutResult =
  | { ok: true; id: number | null; message: string; warnings: string[] }
  | { error: string; kind: NoteKind };

/** Check a book out. `studentEmail` is teacher-only — students borrow as themselves. */
export async function checkOut(b: ActionBook, studentEmail?: string): Promise<CheckoutResult> {
  try {
    const res = await fetch(withBase("/api/checkouts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_key: b.dedupe_key,
        title: b.title,
        isbn13: b.isbn13,
        student_email: studentEmail || undefined,
      }),
    });
    if (sessionExpired(res)) return { error: "Signed out — sign in again.", kind: "err" };
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, id: data.id ?? null, message: data.message ?? "Checked out!", warnings: data.warnings ?? [] };
    }
    return { error: data.error ?? "Couldn't check that out.", kind: res.status === 409 ? "warn" : "err" };
  } catch {
    return { error: OFFLINE_MESSAGE, kind: "err" };
  }
}

export type MyCheckout = {
  id: number;
  book_key: string;
  title: string;
  isbn13: string | null;
  student_email: string;
  checked_out_by: string;
  checked_out_via: "student" | "staff" | "admin";
  due_at: string;
  created_at: string;
  returned_at: string | null;
};

/** Books I have out (teachers: ones I checked out) + a few recent returns. */
export async function myCheckouts(): Promise<
  { open: MyCheckout[]; returned: MyCheckout[]; migrationPending?: boolean } | { error: string }
> {
  try {
    const res = await fetch(withBase("/api/checkouts"));
    if (sessionExpired(res)) return { error: "Signed out — sign in again." };
    if (!res.ok) return { error: OFFLINE_MESSAGE };
    return await res.json();
  } catch {
    return { error: OFFLINE_MESSAGE };
  }
}

/** "I returned it" for one of my (or my student's) checkouts. */
export async function returnCheckout(id: number): Promise<{ ok: true; message: string } | { error: string; kind: NoteKind }> {
  try {
    const res = await fetch(withBase(`/api/checkouts/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "return" }),
    });
    if (sessionExpired(res)) return { error: "Signed out — sign in again.", kind: "err" };
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, message: data.message ?? "Marked returned." };
    return { error: data.error ?? "Couldn't mark that returned.", kind: res.status === 409 ? "warn" : "err" };
  } catch {
    return { error: OFFLINE_MESSAGE, kind: "err" };
  }
}
