import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const Body = z.object({ action: z.enum(["return", "reopen"]) });

/**
 * Management side of a single checkout: mark it returned (a book handed to
 * a librarian instead of tapped in by the student), or reopen one marked
 * returned by mistake. Both are guarded on the current state so racing
 * clicks and stale tabs can't double-apply.
 */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePermission(req, "circulation");
    const { id } = await ctx.params;
    const checkoutId = Number(id);
    if (!Number.isInteger(checkoutId) || checkoutId <= 0) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const patch =
      parsed.data.action === "return"
        ? { returned_at: new Date().toISOString(), returned_by: admin.email }
        : { returned_at: null, returned_by: null };
    let query = db().from("checkouts").update(patch).eq("id", checkoutId);
    query = parsed.data.action === "return" ? query.is("returned_at", null) : query.not("returned_at", "is", null);

    const { data, error } = await query.select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: parsed.data.action === "return" ? "Already marked returned." : "That one isn't marked returned." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  }
);
