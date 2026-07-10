import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyAdminEmails, sendEmail } from "@/lib/email";
import { staffUrl } from "@/lib/hosts";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping (Vercel Cron, bearer-protected):
 *  1. Reminder digest for requests still "new" after 72h (sent once each)
 *  2. Supabase keep-alive (these queries ARE the heartbeat)
 *  3. Prune old rate-limit hits, usage events, and dead invites
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: stale, error } = await db()
    .from("book_requests")
    .select("id, title, author, requester_email, requester_name, copies_requested, created_at, match_status")
    .eq("status", "new")
    .is("reminder_sent_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  let reminded = 0;
  if (stale && stale.length > 0) {
    const admins = await notifyAdminEmails();
    if (admins.length > 0) {
      const lines = [
        `${stale.length} book request${stale.length === 1 ? " has" : "s have"} been waiting more than 72 hours with no action:`,
        ``,
        ...stale.map(
          (r) =>
            `• #${r.id} “${r.title}”${r.author ? ` by ${r.author}` : ""} — ${r.copies_requested} cop${
              r.copies_requested === 1 ? "y" : "ies"
            } for ${r.requester_name ?? r.requester_email} (submitted ${new Date(r.created_at).toLocaleDateString()})`
        ),
        ``,
        `Review: ${staffUrl()}/admin/requests`,
      ];
      await sendEmail(
        admins,
        `Reminder: ${stale.length} book request${stale.length === 1 ? "" : "s"} awaiting action`,
        lines.join("\n")
      );
    }
    const now = new Date().toISOString();
    await db()
      .from("book_requests")
      .update({ reminder_sent_at: now })
      .in("id", stale.map((r) => r.id));
    reminded = stale.length;
  }

  // Pruning
  const d = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  await db().from("rate_limit_hits").delete().lt("created_at", d(7));
  await db().from("usage_events").delete().lt("ts", d(400));
  await db()
    .from("invite_tokens")
    .delete()
    .lt("created_at", d(30))
    .not("used_at", "is", null);
  await db()
    .from("invite_tokens")
    .delete()
    .lt("expires_at", d(30));

  return NextResponse.json({ ok: true, reminded, ranAt: new Date().toISOString() });
}
