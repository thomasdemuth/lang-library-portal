import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/**
 * "I returned it" / a desk check-in — close one checkout. Allowed for the
 * student who has the book, and for ANY teacher or management session (the
 * desk records reality: whoever is holding the phone when a book comes back
 * should be able to say so — decided with the library team). Management can
 * additionally undo a return through /api/admin/circulation.
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
    const isStaff = session.aud === "staff" || session.aud === "admin";
    const { data: row, error: readErr } = await db()
      .from("checkouts")
      .select("id, student_email, checked_out_by, returned_at")
      .eq("id", checkoutId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!row || (!isStaff && row.student_email !== me && row.checked_out_by !== me)) {
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
