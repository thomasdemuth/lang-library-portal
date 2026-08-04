import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  action: z.enum(["hide", "unhide"]),
});

/**
 * Student moderation. "hide" makes the profile private — it 404s the
 * public page and drops the student from classmates' views; "unhide"
 * brings it back.
 */
export const POST = guarded(async (req: NextRequest) => {
  await requirePermission(req, "users");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { email, action } = parsed.data;

  const { data, error } = await db()
    .from("student_profiles")
    .update({ hidden: action === "hide" })
    .eq("email", email)
    .select("email")
    .maybeSingle();
  if (error) {
    if (/hidden|student_profiles|relation|does not exist|schema cache/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "This needs migration 0013 — run it in the Supabase SQL editor." }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "No profile for that email" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
