import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief } from "@/lib/guards";
import { staffUrl } from "@/lib/hosts";

export const DELETE = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireChief(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    const { error } = await db()
      .from("invite_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("used_at", null);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);

/**
 * Regenerate an unclaimed invite: the same row gets a brand-new secret and a
 * fresh 7-day clock, and the old link stops working immediately. Storage
 * stays hash-only — the new link is shown once, exactly like a new invite.
 * Works on active AND expired invites (that's the recovery path), never on
 * used or revoked ones.
 */
export const POST = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireChief(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const { data, error } = await db()
      .from("invite_tokens")
      .update({ token_hash: tokenHash, expires_at: expiresAt })
      .eq("id", id)
      .is("used_at", null)
      .is("revoked_at", null)
      .select("id, label, expires_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: "That invite was already used or revoked — create a new one instead." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      id: data.id,
      url: `${staffUrl()}/admin/invite/${raw}`,
      expires_at: data.expires_at,
    });
  }
);
