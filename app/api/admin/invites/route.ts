import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { staffUrl } from "@/lib/hosts";

const Body = z.object({ label: z.string().trim().max(120).optional() });

/** Mint a single-use invite link. The raw token is returned exactly once. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const label = parsed.success ? parsed.data.label ?? null : null;

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");

  const { data, error } = await db()
    .from("invite_tokens")
    .insert({ token_hash: tokenHash, label, created_by: admin.id })
    .select("id, expires_at")
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    url: `${staffUrl()}/admin/invite/${raw}`,
    expires_at: data.expires_at,
  });
});

export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const { data, error } = await db()
    .from("invite_tokens")
    .select("id, label, created_at, expires_at, used_at, revoked_at, created_by")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ invites: data });
});
