import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief, requirePermission } from "@/lib/guards";
import { sendEmail } from "@/lib/email";
import { staffUrl } from "@/lib/hosts";

const Body = z.object({
  status: z.enum(["new", "in_progress", "ordered", "ready", "declined"]).optional(),
  admin_note: z.string().trim().max(2000).nullable().optional(),
});

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

    // Read the current row first: we need the old status (to detect a real
    // transition) and the requester details for the notification email.
    const { data: before, error: readErr } = await db()
      .from("book_requests")
      .select("id, status, title, author, copies_requested, requester_email, requester_name, admin_note")
      .eq("id", requestId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!before) return NextResponse.json({ error: "No such request" }, { status: 404 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note;
    if (parsed.data.status !== undefined) {
      patch.status = parsed.data.status;
      patch.status_updated_at = new Date().toISOString();
      patch.status_updated_by = admin.id;
    }

    const { data, error } = await db()
      .from("book_requests")
      .update(patch)
      .eq("id", requestId)
      .select("id, status, admin_note, status_updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such request" }, { status: 404 });

    // Teachers hear about final outcomes only: Ready and Declined.
    const newStatus = parsed.data.status;
    if (newStatus && newStatus !== before.status && (newStatus === "ready" || newStatus === "declined")) {
      const note = parsed.data.admin_note !== undefined ? parsed.data.admin_note : before.admin_note;
      // "Sam Lee" → "Sam", but "Ms. Honey" stays whole (a bare title reads wrong)
      const firstToken = before.requester_name?.split(" ")[0];
      const first =
        firstToken && /^(mr|ms|mrs|dr|mx|prof)\.?$/i.test(firstToken) ? before.requester_name : firstToken;
      const copies = `${before.copies_requested} cop${before.copies_requested === 1 ? "y" : "ies"}`;
      const lines =
        newStatus === "ready"
          ? [
              `Hi${first ? ` ${first}` : ""},`,
              ``,
              `Good news — your book request is ready:`,
              ``,
              `  “${before.title}”${before.author ? ` by ${before.author}` : ""} (${copies})`,
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
              `  “${before.title}”${before.author ? ` by ${before.author}` : ""} (${copies})`,
              ``,
              `The library wasn't able to fulfill this one.`,
              note ? `Note from the library: ${note}` : null,
              ``,
              `Questions? Just reply to this email.`,
              ``,
              `— The Lang Library`,
              `${staffUrl()}/requests`,
            ];
      const subject =
        newStatus === "ready"
          ? `Your book request is ready: “${before.title}”`
          : `About your book request: “${before.title}”`;
      after(async () => {
        await sendEmail(
          [before.requester_email],
          subject,
          lines.filter((l): l is string => l !== null).join("\n")
        );
      });
    }

    return NextResponse.json({ ok: true, request: data });
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
