import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, requireSession } from "@/lib/guards";
import { allowHit } from "@/lib/ratelimit";
import { isSource, isTopic, MAX_RATING, MIN_RATING, validTags } from "@/lib/feedback";
import { insertFeedback } from "@/lib/feedback-store";

/**
 * Signed-in feedback. Two shapes post here:
 *   - the free-text box (components/FeedbackForm) — message + optional name;
 *   - the quick form (components/QuickFeedback) — a star rating, chips, and an
 *     optional comment.
 * Everything past `message` is optional, so the original body still validates.
 */
const Body = z.object({
  message: z.string().trim().min(3, "Say a little more than that.").max(4000).optional(),
  name: z.string().trim().max(120).optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
  tags: z.array(z.string()).optional(),
  topic: z.string().optional(),
  source: z.string().optional(),
});

export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  if (!(await allowHit("feedback", session.email, 5, 3600))) {
    return NextResponse.json(
      { error: "That's a lot of feedback in one hour — thank you! Try again later." },
      { status: 429 }
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { message, name, rating, tags, topic, source } = parsed.data;
  if (!message && rating === undefined) {
    return NextResponse.json({ error: "Pick a star or write a note." }, { status: 400 });
  }

  // A rating is always about something; default to the website, which is what
  // the banner and the portal's feedback page ask about.
  const finalTopic = isTopic(topic) ? topic : rating !== undefined ? "website" : null;

  const ok = await insertFeedback({
    audience: session.aud === "student" ? "student" : "staff",
    email: session.email,
    name: name ?? null,
    message: message ?? null,
    rating: rating ?? null,
    tags: finalTopic ? validTags(finalTopic, tags) : [],
    topic: finalTopic,
    spot: null,
    source: isSource(source) ? source : "form",
  });
  if (!ok) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
});
