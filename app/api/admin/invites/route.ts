import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief } from "@/lib/guards";
import { staffUrl } from "@/lib/hosts";
import { cleanPermissions } from "@/lib/permissions";

const Body = z.object({
  label: z.string().trim().max(120).optional(),
  role: z.enum(["chief", "admin"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

/** Mint a single-use invite link carrying the role + starting powers the Chief chose. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireChief(req);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const label = parsed.success ? parsed.data.label ?? null : null;
  const role = parsed.success ? parsed.data.role ?? "admin" : "admin";
  // A chief invite ignores per-power flags (chiefs have everything).
  const permissions = role === "chief" ? {} : cleanPermissions(parsed.success ? parsed.data.permissions : {});

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");

  const row: Record<string, unknown> = { token_hash: tokenHash, label, created_by: admin.id, role, permissions };
  let { data, error } = await db().from("invite_tokens").insert(row).select("id, expires_at").single();
  // Resilience: before migration 0004, the role/permissions columns don't exist.
  if (error && /role|permissions|column/i.test(error.message ?? "")) {
    ({ data, error } = await db()
      .from("invite_tokens")
      .insert({ token_hash: tokenHash, label, created_by: admin.id })
      .select("id, expires_at")
      .single());
  }
  if (error || !data) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    url: `${staffUrl()}/admin/invite/${raw}`,
    expires_at: data.expires_at,
  });
});

export const GET = guarded(async (req: NextRequest) => {
  await requireChief(req);
  const { data, error } = await db()
    .from("invite_tokens")
    .select("id, label, created_at, expires_at, used_at, revoked_at, created_by")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ invites: data });
});
