import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { getActiveSyncId } from "@/lib/active-sync";
import {
  DEFAULT_EMAIL_MODE,
  dueDate,
  dueLabel,
  isEmailMode,
  isSchoolEmail,
  SOFT_LIMIT,
  type EmailMode,
} from "@/lib/circulation";
import { getSetting } from "@/lib/settings";
import { libraryMailbox, sendEmail } from "@/lib/email";
import { displayNameFull } from "@/lib/play";

const Body = z.object({
  book_key: z.string().min(1).max(600),
  title: z.string().trim().min(1).max(500),
  isbn13: z.string().max(20).nullish(),
  // Only honored for teacher/admin sessions — students always borrow as
  // themselves, whatever the body claims.
  student_email: z.string().trim().max(200).optional(),
});

function migrationPending(message: string | undefined): boolean {
  return /checkouts|relation|does not exist|schema cache/i.test(message ?? "");
}

/** My side of circulation: books I have out (and, for teachers, ones I checked out). */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  if (session.aud === "guest") return NextResponse.json({ open: [], returned: [] });

  const cols = "id, book_key, title, isbn13, student_email, checked_out_by, checked_out_via, due_at, created_at, returned_at";
  const who = session.aud === "student" ? "student_email" : "checked_out_by";
  const [openRes, returnedRes] = await Promise.all([
    db().from("checkouts").select(cols).eq(who, session.email).is("returned_at", null).order("created_at", { ascending: false }).limit(50),
    db().from("checkouts").select(cols).eq(who, session.email).not("returned_at", "is", null).order("returned_at", { ascending: false }).limit(10),
  ]);
  if (openRes.error) {
    if (migrationPending(openRes.error.message)) return NextResponse.json({ open: [], returned: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ open: openRes.data ?? [], returned: returnedRes.data ?? [] });
});

/**
 * Check a book out. Soft rules by design: nothing here refuses a checkout —
 * the response carries warnings ("that was our last copy", "that's book 4
 * out at once") and the circulation tab shows the same flags. The only hard
 * stop is the same student + same book twice.
 */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  if (session.aud === "guest") {
    return NextResponse.json({ error: "Sign in with your school account to check out books." }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = parsed.data;

  let borrower = session.email.toLowerCase();
  if (session.aud !== "student") {
    const target = body.student_email?.toLowerCase();
    if (!target) {
      return NextResponse.json({ error: "Who is this book for? Add the student's school email." }, { status: 400 });
    }
    if (!isSchoolEmail(target)) {
      return NextResponse.json({ error: "That doesn't look like a school email." }, { status: 400 });
    }
    borrower = target;
  }
  const via = session.aud === "student" ? "student" : session.aud === "admin" ? "admin" : "staff";
  const due = dueDate();

  const { data, error } = await db()
    .from("checkouts")
    .insert({
      book_key: body.book_key,
      title: body.title,
      isbn13: body.isbn13 ?? null,
      student_email: borrower,
      checked_out_by: session.email.toLowerCase(),
      checked_out_via: via,
      due_at: due.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? "")) {
      const who = via === "student" ? "You" : displayNameFull(borrower);
      return NextResponse.json({ error: `${who} already ${via === "student" ? "have" : "has"} this book out.` }, { status: 409 });
    }
    if (migrationPending(error.message)) {
      return NextResponse.json({ error: "Checkouts unlock after the next library update!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Soft-rule warnings, computed after the insert so counts include this
  // checkout. Both lookups are best-effort — a failure just drops the flag.
  const warnings: string[] = [];
  const [openForBook, openForBorrower, copies] = await Promise.all([
    db().from("checkouts").select("id", { count: "exact", head: true }).eq("book_key", body.book_key).is("returned_at", null),
    db().from("checkouts").select("id", { count: "exact", head: true }).eq("student_email", borrower).is("returned_at", null),
    (async () => {
      const syncId = await getActiveSyncId();
      if (!syncId) return null;
      const { data: row } = await db().from("books").select("copies").eq("sync_id", syncId).eq("dedupe_key", body.book_key).maybeSingle();
      return (row?.copies as number | undefined) ?? null;
    })(),
  ]);
  const bookOut = openForBook.count ?? 0;
  if (copies !== null && bookOut >= copies) {
    warnings.push(
      bookOut === copies
        ? "That was the library's last copy on the shelf."
        : "More copies of this book are checked out than the catalog says we own — worth a mention to the library team."
    );
  }
  const borrowerOut = openForBorrower.count ?? 0;
  if (borrowerOut > SOFT_LIMIT) {
    const who = via === "student" ? "You now have" : `${displayNameFull(borrower)} now has`;
    warnings.push(`${who} ${borrowerOut} books out — the usual limit is ${SOFT_LIMIT}. Bring one back soon!`);
  }

  // Tell the library mailbox, per the mode set in Management → Circulation.
  const stored = await getSetting<unknown>("circulation_email_mode", DEFAULT_EMAIL_MODE);
  const mode: EmailMode = isEmailMode(stored) ? stored : DEFAULT_EMAIL_MODE;
  if (mode === "per_checkout") {
    const lines = [
      `${body.title}`,
      `Borrower: ${displayNameFull(borrower)} <${borrower}>`,
      via !== "student" ? `Checked out by: ${displayNameFull(session.email)} <${session.email}> (${via})` : null,
      `Due: ${due.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" })} (${dueLabel(due.toISOString())})`,
      ...warnings.map((w) => `Note: ${w}`),
      "",
      "Circulation lives in Management → Circulation (returns, overdue, email settings).",
    ].filter((l): l is string => l !== null);
    // Best-effort: a mail hiccup must never undo a checkout that already happened.
    await sendEmail([libraryMailbox()], `Book checked out: ${body.title}`, lines.join("\n"));
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? null,
    message:
      via === "student"
        ? `Enjoy! Bring it back by ${due.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" })}.`
        : `Checked out to ${displayNameFull(borrower)} — ${dueLabel(due.toISOString())}.`,
    warnings,
  });
});
