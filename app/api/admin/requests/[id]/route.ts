import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief, requirePermission } from "@/lib/guards";
import { sendEmail } from "@/lib/email";
import { staffUrl } from "@/lib/hosts";
import {
  clearsReminder,
  isRequestStatus,
  shouldNotifyTeacher,
  transitionError,
  type RequestStatus,
} from "@/lib/request-status";

const Body = z.object({
  status: z.enum(["new", "in_progress", "ordered", "ready", "declined"]).optional(),
  admin_note: z.string().trim().max(2000).nullable().optional(),
});

/** Pre-0022 databases have no notified_status/notified_at — degrade, don't break. */
function isMissingColumn(message: string | undefined): boolean {
  return /notified_status|notified_at|column/i.test(message ?? "");
}

const BEFORE_COLUMNS =
  "id, status, title, author, copies_requested, requester_email, requester_name, admin_note";

type BeforeRow = {
  id: number;
  status: string;
  title: string;
  author: string | null;
  copies_requested: number;
  requester_email: string;
  requester_name: string | null;
  admin_note: string | null;
  notified_status?: string | null;
};

/** "Sam Lee" → "Sam", but "Ms. Honey" stays whole (a bare title reads wrong). */
function greetingName(fullName: string | null): string | undefined {
  const firstToken = fullName?.split(" ")[0];
  return firstToken && /^(mr|ms|mrs|dr|mx|prof)\.?$/i.test(firstToken) ? (fullName ?? undefined) : firstToken;
}

function outcomeEmail(
  before: BeforeRow,
  status: "ready" | "declined",
  note: string | null
): { subject: string; text: string } {
  const first = greetingName(before.requester_name);
  const copies = `${before.copies_requested} cop${before.copies_requested === 1 ? "y" : "ies"}`;
  const book = `  “${before.title}”${before.author ? ` by ${before.author}` : ""} (${copies})`;
  const lines =
    status === "ready"
      ? [
          `Hi${first ? ` ${first}` : ""},`,
          ``,
          `Good news — your book request is ready:`,
          ``,
          book,
          note ? `` : null,
          note ? `Note from the library: ${note}` : null,
          ``,
          `— The Lang Library`,
          `${staffUrl()}/requests`,
        ]
      : [
          `Hi${first ? ` ${first}` : ""},`,
          ``,
          `An update on your book request:`,
          ``,
          book,
          ``,
          `The library wasn't able to fulfill this one.`,
          note ? `Note from the library: ${note}` : null,
          ``,
          `Questions? Just reply to this email.`,
          ``,
          `— The Lang Library`,
          `${staffUrl()}/requests`,
        ];
  return {
    subject:
      status === "ready"
        ? `Your book request is ready: “${before.title}”`
        : `About your book request: “${before.title}”`,
    text: lines.filter((l): l is string => l !== null).join("\n"),
  };
}

export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePermission(req, "requests");
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || (parsed.data.status === undefined && parsed.data.admin_note === undefined)) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Read the current row first: we need the old status (to validate the
    // transition and detect a real one), whether the teacher has already been
    // emailed about this outcome, and their details for the notification.
    let hasNotifiedColumns = true;
    let read = await db()
      .from("book_requests")
      .select(`${BEFORE_COLUMNS}, notified_status`)
      .eq("id", requestId)
      .maybeSingle();
    if (read.error && isMissingColumn(read.error.message)) {
      hasNotifiedColumns = false;
      read = await db().from("book_requests").select(BEFORE_COLUMNS).eq("id", requestId).maybeSingle();
    }
    if (read.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!read.data) return NextResponse.json({ error: "No such request" }, { status: 404 });
    const before = read.data as BeforeRow;

    const newStatus = parsed.data.status;
    const fromStatus: RequestStatus = isRequestStatus(before.status) ? before.status : "new";

    // Enforce the lifecycle. Rejecting here (rather than in the UI only) is
    // what stops a stale panel from walking a Ready request backwards.
    if (newStatus && newStatus !== before.status) {
      const problem = transitionError(fromStatus, newStatus);
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note;
    if (newStatus !== undefined) {
      patch.status = newStatus;
      patch.status_updated_at = nowIso;
      patch.status_updated_by = admin.id;
      // Reopening to `new` re-arms the 72h chase-up; otherwise a reopened
      // request would sit forever with a spent reminder flag.
      if (clearsReminder(newStatus)) patch.reminder_sent_at = null;
    }

    const { data, error } = await db()
      .from("book_requests")
      .update(patch)
      .eq("id", requestId)
      .select("id, status, admin_note, status_updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such request" }, { status: 404 });

    // Teachers hear about final outcomes only, and only the first time this
    // request reaches one. The send is awaited (not deferred to after()) so the
    // admin who pressed the button learns whether the mail actually left.
    let emailed: boolean | null = null;
    const notify =
      newStatus !== undefined &&
      shouldNotifyTeacher(fromStatus, newStatus, hasNotifiedColumns ? before.notified_status : null);
    if (notify && (newStatus === "ready" || newStatus === "declined")) {
      const note = parsed.data.admin_note !== undefined ? parsed.data.admin_note : before.admin_note;
      const { subject, text } = outcomeEmail(before, newStatus, note);
      emailed = await sendEmail([before.requester_email], subject, text);
      if (emailed && hasNotifiedColumns) {
        // Only a delivered mail counts as "notified" — a failure leaves the
        // slot open so a later legitimate re-entry can try again.
        const stamp = await db()
          .from("book_requests")
          .update({ notified_status: newStatus, notified_at: new Date().toISOString() })
          .eq("id", requestId);
        if (stamp.error) console.error("notified_status stamp failed:", stamp.error.message);
      }
    }

    return NextResponse.json({
      ok: true,
      request: data,
      emailed,
      notified_to: notify ? (before.requester_name ?? before.requester_email) : null,
    });
  }
);

/** Deleting a request is reserved for Chief Admins. */
export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireChief(req);
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    const { error } = await db().from("book_requests").delete().eq("id", requestId);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);
