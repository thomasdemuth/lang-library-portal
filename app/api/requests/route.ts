import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";
import { chooseMatch, matchMessage, normalizeTitle, type Candidate } from "@/lib/match";
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

  // Match against the live inventory
  const titleNorm = normalizeTitle(b.title) || b.title.toLowerCase().trim();
  const { data: rows } = await db().rpc("match_candidates", { p_title_norm: titleNorm });
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
  const result = chooseMatch({ title: b.title, author: b.author, copies: b.copies }, candidates);
  const message = matchMessage(result, b.copies);

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
      match_status: result.status,
      matched_title: result.matched?.title ?? null,
      matched_copies: result.matched?.copies ?? null,
      match_candidates: result.candidates,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Notify admins after the response is sent — never slows the teacher down
  after(async () => {
    const admins = await notifyChiefEmails();
    if (admins.length === 0) return;
    const lines = [
      `New book request #${created.id} — ${STATUS_TAG[result.status]}`,
      ``,
      `Title:     ${b.title}`,
      b.author ? `Author:    ${b.author}` : null,
      `Copies:    ${b.copies}`,
      b.needed_by ? `Needed by: ${b.needed_by}` : null,
      `From:      ${b.requester_name ? `${b.requester_name} <${session.email}>` : session.email}`,
      b.notes ? `Notes:     ${b.notes}` : null,
      ``,
      `Match: ${message}`,
      ``,
      `Review: ${staffUrl()}/admin/requests`,
    ].filter((l): l is string => l !== null);
    await sendEmail(admins, `New book request: “${b.title}” — ${STATUS_TAG[result.status]}`, lines.join("\n"));
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    match_status: result.status,
    message,
  });
});
