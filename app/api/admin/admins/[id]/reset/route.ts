import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief } from "@/lib/guards";
import { staffUrl } from "@/lib/hosts";

/**
 * Chief-only: mint a one-time password-reset link for another admin. Rides
 * the invite machinery (invite_tokens, kind='reset', hash-only storage): the
 * target opens the link, sets a new password on their EXISTING account, and
 * every session they had is revoked (session_v bump in claim_password_reset).
 * Nothing changes on the account until the target completes the form.
 */
export const POST = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const chief = await requireChief(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    // Resilient to migration 0006 (deleted_at) not having run yet.
    let read = await db()
      .from("admins")
      .select("id, name, disabled_at, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (read.error && /deleted_at|column/i.test(read.error.message ?? "")) {
      read = await db().from("admins").select("id, name, disabled_at").eq("id", id).maybeSingle();
    }
    if (read.error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    const target = read.data as { id: string; name: string; disabled_at: string | null; deleted_at?: string | null } | null;
    if (!target || target.deleted_at) {
      return NextResponse.json({ error: "No such admin" }, { status: 404 });
    }
    if (target.disabled_at) {
      return NextResponse.json(
        { error: "That account is disabled — re-enable it before resetting the password." },
        { status: 400 }
      );
    }

    const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");

    const { data, error } = await db()
      .from("invite_tokens")
      .insert({
        token_hash: tokenHash,
        kind: "reset",
        target_admin: target.id,
        label: `Password reset — ${target.name}`,
        created_by: chief.id,
      })
      .select("id, expires_at")
      .single();
    if (error) {
      if (/kind|target_admin|column/i.test(error.message ?? "")) {
        return NextResponse.json(
          { error: "Password resets aren't set up yet — run the pending database migration (0023)." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      url: `${staffUrl()}/admin/invite/${raw}`,
      expires_at: data.expires_at,
    });
  }
);
