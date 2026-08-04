import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";
import {
  chooseMatch,
  matchMessage,
  normalizeTitle,
  type Candidate,
  type MatchResult,
} from "@/lib/match";
import { notifyChiefEmails, sendEmail } from "@/lib/email";
import { staffUrl } from "@/lib/hosts";

const Body = z.object({
  title: z.string().trim().min(1, "Enter the book's title").max(300),
  author: z.string().trim().max(200).optional(),
  copies: z.number().int().min(1).max(99),
  needed_by: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  requester_name: z.string().trim().max(120).optional(),
});

const STATUS_TAG: Record<string, string> = {
  found: "FOUND IN LIBRARY",
  insufficient: "ACTION REQUIRED — not enough copies",
  not_found: "ACTION REQUIRED — not in inventory",
};
/** The RPC failed — say so plainly rather than implying a checked result. */
const UNCHECKED_TAG = "NEEDS A MANUAL SHELF CHECK";

/** What the teacher sees on the confirmation, and how loudly. */
function teacherNotice(
  result: MatchResult | null,
  copies: number
): { message: string; kind: "ok" | "info" | "warn" } {
  if (!result) {
    return {
      message:
        "Request received — we couldn't check the shelves right now; a librarian will look.",
      kind: "warn",
    };
  }
  if (result.status === "not_found") {
    return {
      message:
        "Request received — we don't have this one yet, so we'll look into ordering it. You'll get an email when it's ready.",
      kind: "info",
    };
  }
  return { message: matchMessage(result, copies), kind: result.status === "found" ? "ok" : "info" };
}

export const POST = guarded(async (req: NextRequest) => {
  const session = await requireStaff(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const b = parsed.data;
  const titleNorm = normalizeTitle(b.title) || b.title.toLowerCase().trim();

  // Duplicate guard: a teacher hitting Submit twice (or re-asking for a book
  // they already have in flight) used to create N rows and N rounds of chief
  // email. Only OPEN requests block a new one — the two terminal states don't:
  // re-asking after a "no" (declined) is a real request, and a title fulfilled
  // last year (ready) must not lock the teacher out of ever asking again.
  // Normalized in JS because book_requests has no title_norm column.
  const OPEN_STATUSES = ["new", "in_progress", "ordered"];
  const { data: existing } = await db()
    .from("book_requests")
    .select("id, title, status")
    .eq("requester_email", session.email)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  const dupe = (existing ?? []).find(
    (r) => (normalizeTitle(r.title) || r.title.toLowerCase().trim()) === titleNorm
  );
  if (dupe) {
    return NextResponse.json(
      {
        error: "You already have an open request for this — it's in your list below.",
        duplicate_of: dupe.id,
      },
      { status: 409 }
    );
  }

  // Match against the live inventory. A failed RPC is NOT "not in inventory":
  // persisting not_found there would file a false result against the library
  // and email the chiefs an ACTION REQUIRED that may be pure noise. Leave
  // match_status null so it reads as "unchecked" everywhere.
  const { data: rows, error: matchErr } = await db().rpc("match_candidates", {
    p_title_norm: titleNorm,
  });
  let result: MatchResult | null = null;
  if (matchErr) {
    console.error("match_candidates failed:", matchErr.message);
  } else {
    const candidates: Candidate[] = (rows ?? []).map(
      (r: {
        id: number;
        title: string;
        creators: string | null;
        copies: number;
        title_norm: string;
        creators_norm: string | null;
      }) => ({
        id: r.id,
        title: r.title,
        creators: r.creators,
        copies: r.copies,
        title_norm: r.title_norm,
        creators_norm: r.creators_norm,
      })
    );
    result = chooseMatch({ title: b.title, author: b.author, copies: b.copies }, candidates);
  }
  const adminMessage = matchMessage(result, b.copies);
  const notice = teacherNotice(result, b.copies);

  const { data: created, error } = await db()
    .from("book_requests")
    .insert({
      requester_email: session.email,
      requester_name: b.requester_name ?? null,
      title: b.title,
      author: b.author ?? null,
      copies_requested: b.copies,
      needed_by: b.needed_by ?? null,
      notes: b.notes ?? null,
      match_status: result?.status ?? null,
      matched_title: result?.matched?.title ?? null,
      matched_copies: result?.matched?.copies ?? null,
      match_candidates: result?.candidates ?? null,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Both emails go out after the response is sent — never slows the teacher
  // down, and a mail failure can't take the (already saved) request with it.
  const tag = result ? STATUS_TAG[result.status] : UNCHECKED_TAG;
  after(async () => {
    const admins = await notifyChiefEmails();
    if (admins.length === 0) return;
    const lines = [
      `New book request #${created.id} — ${tag}`,
      ``,
      `Title:     ${b.title}`,
      b.author ? `Author:    ${b.author}` : null,
      `Copies:    ${b.copies}`,
      b.needed_by ? `Needed by: ${b.needed_by}` : null,
      `From:      ${b.requester_name ? `${b.requester_name} <${session.email}>` : session.email}`,
      b.notes ? `Notes:     ${b.notes}` : null,
      ``,
      `Match: ${adminMessage}`,
      ``,
      `Review: ${staffUrl()}/admin/requests`,
    ].filter((l): l is string => l !== null);
    await sendEmail(admins, `New book request: “${b.title}” — ${tag}`, lines.join("\n"));
  });

  // Receipt to the requester, so a submitted request isn't a shout into a void.
  after(async () => {
    const firstToken = b.requester_name?.split(" ")[0];
    const first =
      firstToken && /^(mr|ms|mrs|dr|mx|prof)\.?$/i.test(firstToken) ? b.requester_name : firstToken;
    const copies = `${b.copies} cop${b.copies === 1 ? "y" : "ies"}`;
    const lines = [
      `Hi${first ? ` ${first}` : ""},`,
      ``,
      `Thanks — we've got your request:`,
      ``,
      `  “${b.title}”${b.author ? ` by ${b.author}` : ""} (${copies})`,
      b.needed_by ? `  Needed by ${b.needed_by}` : null,
      ``,
      `What happens next: a librarian reviews it, usually within 3 school days.`,
      `We'll email you again once it's ready to collect — or if we can't get hold of it.`,
      ``,
      `You can see where it stands any time at ${staffUrl()}/requests`,
      ``,
      `— The Lang Library`,
    ].filter((l): l is string => l !== null);
    await sendEmail([session.email], `We got your request — ${b.title}`, lines.join("\n"));
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    match_status: result?.status ?? null,
    message: notice.message,
    kind: notice.kind,
  });
});
