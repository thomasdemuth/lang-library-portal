import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyChiefEmails, sendEmail, weeklyDigestEmails } from "@/lib/email";
import { staffUrl } from "@/lib/hosts";
import { allowHit } from "@/lib/ratelimit";
import { STATUS_LABELS } from "@/lib/labels";
import { enrichDrip } from "@/lib/enrich";

export const dynamic = "force-dynamic";
// Housekeeping + a time-boxed enrichment drip (enrichment runs last, so the
// emails/pruning always complete even if the function is cut short).
export const maxDuration = 60;

/**
 * Daily housekeeping (Vercel Cron, bearer-protected):
 *  1. Reminder digest for requests still "new" after 72h (sent once each)
 *  2. Weekly summary email on Fridays (America/New_York), once per week
 *  3. Supabase keep-alive (these queries ARE the heartbeat)
 *  4. Prune old rate-limit hits, usage events, and dead invites
 */

function nyDateParts(): { weekday: string; date: string } {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now); // YYYY-MM-DD
  return { weekday, date };
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(
    new Date(iso)
  );
}

/** Compose and send the Friday summary. Returns "sent" | "skipped" | "empty-recipients". */
async function sendWeeklyDigest(nyDate: string): Promise<string> {
  // Once per calendar week, even across retries/forced runs.
  if (!(await allowHit("weekly_digest", nyDate.slice(0, 8) + "wk" + isoWeek(nyDate), 1, 6 * 24 * 3600))) {
    return "skipped";
  }
  const recipients = await weeklyDigestEmails();
  if (recipients.length === 0) return "empty-recipients";

  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const fromIso = from.toISOString();
  const client = db();

  const [requests, statusChanges, feedback, syncs, shelves, usage, newAdmins] = await Promise.all([
    client
      .from("book_requests")
      .select("id, title, requester_name, requester_email, status, match_status, created_at")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .limit(100),
    client
      .from("book_requests")
      .select("id, title, status, status_updated_at")
      .gte("status_updated_at", fromIso)
      .order("status_updated_at", { ascending: true })
      .limit(100),
    client
      .from("feedback")
      .select("audience, name, email, message, created_at")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .limit(50),
    client
      .from("inventory_syncs")
      .select("source_filename, merged_count, activated_at")
      .gte("activated_at", fromIso),
    client.from("shelves").select("id", { count: "exact", head: true }).gte("updated_at", fromIso),
    client.rpc("usage_summary", { p_from: fromIso.slice(0, 10), p_to: new Date().toISOString().slice(0, 10) }),
    client.from("admins").select("name, username, created_at").gte("created_at", fromIso),
  ]);

  const reqs = requests.data ?? [];
  const changes = (statusChanges.data ?? []).filter((c) => c.status !== "new");
  const fb = feedback.data ?? [];
  const imports = syncs.data ?? [];
  const shelfCount = shelves.count ?? 0;
  const usageRows = (usage.data ?? []) as { views: number; uniques: number }[];
  const views = usageRows.reduce((n, r) => n + Number(r.views), 0);
  const uniques = usageRows.reduce((n, r) => n + Number(r.uniques), 0);
  const admins = newAdmins.data ?? [];

  const range = `${fmtDay(fromIso)} – ${fmtDay(new Date().toISOString())}`;
  const lines: (string | null)[] = [
    `Your weekly Lang Library summary (${range}):`,
    ``,
    `── Book requests ─────────────────────────`,
    reqs.length === 0
      ? `No new requests this week.`
      : `${reqs.length} new request${reqs.length === 1 ? "" : "s"}:`,
    ...reqs.map(
      (r) =>
        `  • “${r.title}” — ${r.requester_name ?? r.requester_email} · now: ${STATUS_LABELS[r.status] ?? r.status}`
    ),
    changes.length > 0 ? `` : null,
    changes.length > 0 ? `${changes.length} status update${changes.length === 1 ? "" : "s"}:` : null,
    ...changes.map((c) => `  • “${c.title}” → ${STATUS_LABELS[c.status] ?? c.status}`),
    ``,
    `── Feedback ──────────────────────────────`,
    fb.length === 0 ? `No feedback this week.` : `${fb.length} submission${fb.length === 1 ? "" : "s"}:`,
    ...fb.map(
      (f) =>
        `  • [${f.audience}] ${f.name ?? f.email}: ${f.message.length > 200 ? f.message.slice(0, 200) + "…" : f.message}`
    ),
    ``,
    `── Library changelog ─────────────────────`,
    imports.length > 0
      ? `  • Inventory refreshed: ${imports.map((i) => `${i.merged_count?.toLocaleString() ?? "?"} titles (${i.source_filename ?? "CSV"})`).join("; ")}`
      : `  • No inventory imports.`,
    `  • Map: ${shelfCount === 0 ? "no shelf changes" : `${shelfCount} shel${shelfCount === 1 ? "f" : "ves"} added or edited`}.`,
    admins.length > 0 ? `  • New admin${admins.length === 1 ? "" : "s"}: ${admins.map((a) => a.name).join(", ")}.` : null,
    `  • Site traffic: ${views.toLocaleString()} page views · ~${uniques.toLocaleString()} visitors.`,
    ``,
    `Manage everything: ${staffUrl()}/admin`,
    `(You can mute this summary under My Account → Email notifications.)`,
  ];

  await sendEmail(recipients, `Lang Library — weekly summary (${range})`, lines.filter((l): l is string => l !== null).join("\n"));
  return "sent";
}

/** ISO week number for the once-per-week guard key. */
function isoWeek(nyDate: string): number {
  const d = new Date(nyDate + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}
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
    const admins = await notifyChiefEmails();
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

  // Weekly summary: Fridays in school-local time (or ?weekly=force for testing)
  const { weekday, date } = nyDateParts();
  let weekly = "not-friday";
  if (weekday === "Fri" || req.nextUrl.searchParams.get("weekly") === "force") {
    weekly = await sendWeeklyDigest(date);
  }

  // Cover/description enrichment — runs LAST, time-boxed, best-effort.
  let enrich = { scanned: 0, filledDesc: 0, filledIsbn: 0, gbQuotaHit: false, done: true };
  try {
    enrich = await enrichDrip(40_000);
  } catch {
    /* never let enrichment fail the cron */
  }

  return NextResponse.json({ ok: true, reminded, weekly, enrich, ranAt: new Date().toISOString() });
}
