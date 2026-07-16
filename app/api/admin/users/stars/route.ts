import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  delta: z.number().int().min(-1000).max(1000).refine((n) => n !== 0, "delta can't be zero"),
});

/**
 * Grant (or take back) stars on a student profile. Points never go below
 * zero, and every adjustment leaves an internal note so admins can see
 * who gave what.
 */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "users");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { email, delta } = parsed.data;

  // Optimistic-lock retry: read points, write clamped points, require the
  // read value to still hold (same pattern as the shop's no-double-spend).
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: profile, error: readErr } = await db()
      .from("student_profiles")
      .select("points")
      .eq("email", email)
      .maybeSingle();
    if (readErr) {
      if (/student_profiles|relation|does not exist|schema cache/i.test(readErr.message ?? "")) {
        return NextResponse.json({ error: "This needs migration 0011 — run it in the Supabase SQL editor." }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!profile) return NextResponse.json({ error: "No profile for that email" }, { status: 404 });

    const points = Math.max(0, profile.points + delta);
    const { data: updated, error } = await db()
      .from("student_profiles")
      .update({ points })
      .eq("email", email)
      .eq("points", profile.points)
      .select("points")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!updated) continue; // points moved under us (student earned stars) — retry

    // Audit trail as an internal note; best-effort (notes table is 0013)
    const applied = points - profile.points;
    const note = {
      email,
      author: admin.name || admin.username || admin.email,
      body: applied >= 0 ? `Gave ${applied} stars.` : `Removed ${-applied} stars.`,
    };
    const { data: noteRow } = await db()
      .from("account_notes")
      .insert(note)
      .select("id, author, body, created_at")
      .maybeSingle();

    return NextResponse.json({ ok: true, points, note: noteRow ?? null });
  }
  return NextResponse.json({ error: "That profile is busy — try again." }, { status: 409 });
});
