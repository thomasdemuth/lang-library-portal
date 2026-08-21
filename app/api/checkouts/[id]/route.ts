import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/**
 * "I returned it" — close one checkout. Allowed for the student who has the
 * book and for the teacher who checked it out on their behalf. Management
 * marks returns through /api/admin/circulation (which can also undo one);
 * an admin session that personally made the checkout is covered here too.
 */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession(req);
    if (session.aud === "guest") return NextResponse.json({ error: "Not signed in" }, { status: 403 });
    const { id } = await ctx.params;
    const checkoutId = Number(id);
    if (!Number.isInteger(checkoutId) || checkoutId <= 0) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    const me = session.email.toLowerCase();
    const { data: row, error: readErr } = await db()
      .from("checkouts")
      .select("id, student_email, checked_out_by, returned_at")
      .eq("id", checkoutId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!row || (row.student_email !== me && row.checked_out_by !== me)) {
      // Same shape for "missing" and "not yours": no probing for other
      // people's checkout ids.
      return NextResponse.json({ error: "That checkout isn't yours to return." }, { status: 404 });
    }
    if (row.returned_at) {
      return NextResponse.json({ error: "Already marked returned — thanks!" }, { status: 409 });
    }

    // Guarded on returned_at so two racing taps only record one return.
    const { data, error } = await db()
      .from("checkouts")
      .update({ returned_at: new Date().toISOString(), returned_by: me })
      .eq("id", checkoutId)
      .is("returned_at", null)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Already marked returned — thanks!" }, { status: 409 });
    return NextResponse.json({ ok: true, message: "Marked returned — thanks for bringing it back!" });
  }
);
