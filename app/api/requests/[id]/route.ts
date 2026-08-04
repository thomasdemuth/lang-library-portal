import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";

/**
 * A teacher may withdraw their own request — but only while it is still `new`.
 * Once the library has picked it up (in progress / ordered / ready / declined)
 * there is work and money attached to the row, and a hard delete would erase
 * the record of it with no trace. Those stay put; the teacher can ask the
 * library to close them.
 */
export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireStaff(req);
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    // Scoped to the requester's own email — can't touch anyone else's request.
    const { data: own, error: readErr } = await db()
      .from("book_requests")
      .select("id, status")
      .eq("id", requestId)
      .eq("requester_email", session.email)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!own) return NextResponse.json({ error: "That request isn't yours to delete." }, { status: 404 });
    if (own.status !== "new") {
      return NextResponse.json(
        {
          error:
            "The library is already working on this one, so it can't be withdrawn here. Reply to your request email and we'll close it for you.",
        },
        { status: 409 }
      );
    }

    const { data, error } = await db()
      .from("book_requests")
      .delete()
      .eq("id", requestId)
      .eq("requester_email", session.email)
      .eq("status", "new")
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "That request isn't yours to delete." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
);
