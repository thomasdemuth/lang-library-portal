import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { allowHit } from "@/lib/ratelimit";

const Body = z.object({
  message: z.string().trim().min(3, "Say a little more than that.").max(4000),
  name: z.string().trim().max(120).optional(),
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
  const { error } = await db().from("feedback").insert({
    audience: session.aud === "student" ? "student" : "staff",
    email: session.email,
    name: parsed.data.name ?? null,
    message: parsed.data.message,
  });
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
});
