import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/guards";
import { allowHit, clientIp } from "@/lib/ratelimit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { MAX_RATING, MIN_RATING, validTags } from "@/lib/feedback";
import { resolveSpot } from "@/lib/feedback-spots";
import { insertFeedback, loadSpotShelves } from "@/lib/feedback-store";

/**
 * Anonymous feedback from the QR posters in the library (app/hi/[code]).
 *
 * Deliberately unauthenticated: the whole point is that someone standing at a
 * shelf can answer in one tap, and a Google sign-in wall would collect nothing.
 * What replaces the session as a guard:
 *   - a rating is required, so an empty POST can't create a row;
 *   - the honeypot field below, which only an automated client fills in;
 *   - a per-IP hourly cap (the school is behind few addresses, so it's set
 *     loose enough for a class visiting the library together);
 *   - `topic` and the zone are resolved HERE from the scanned code — the body
 *     can't claim to be feedback about something it isn't;
 *   - the middleware's origin check still applies to this route.
 * A session cookie is used if one happens to be present, but never required.
 */
const Body = z.object({
  spot: z.string().max(80).optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  tags: z.array(z.string()).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  name: z.string().trim().max(120).optional(),
  /** Honeypot. Never rendered visibly; a value here means "not a person". */
  website: z.string().optional(),
});

export const POST = guarded(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Pick a star first." },
      { status: 400 }
    );
  }
  const { spot, rating, tags, message, name, website } = parsed.data;

  // Bots fill every field they find. Answer as if it worked and write nothing.
  if (website) return NextResponse.json({ ok: true });

  if (!(await allowHit("feedback_public", clientIp(req), 30, 3600))) {
    return NextResponse.json(
      { error: "Lots of feedback from here in the last hour — try again later." },
      { status: 429 }
    );
  }

  const resolved = resolveSpot(spot ?? "", await loadSpotShelves());

  // Signed in and scanning a poster anyway? Keep the attribution. Guests are
  // account-less and carry an empty email, so they stay anonymous like anyone
  // who never signed in at all.
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const known = session && session.aud !== "guest" && session.email ? session : null;

  const ok = await insertFeedback({
    audience: known ? (known.aud === "student" ? "student" : "staff") : "public",
    email: known?.email ?? null,
    name: name ?? null,
    message: message ?? null,
    rating,
    tags: validTags(resolved.topic, tags),
    topic: resolved.topic,
    spot: resolved.code,
    source: "qr",
  });
  if (!ok) return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
});
