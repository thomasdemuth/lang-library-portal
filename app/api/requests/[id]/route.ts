import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";

/** A teacher may delete (withdraw) their own request. */
export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireStaff(req);
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    // Scoped to the requester's own email — can't touch anyone else's request.
    const { data, error } = await db()
      .from("book_requests")
      .delete()
      .eq("id", requestId)
      .eq("requester_email", session.email)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "That request isn't yours to delete." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
);
