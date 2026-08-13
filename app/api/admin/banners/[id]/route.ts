import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { invalidateBanners } from "@/lib/banners-store";
import { nextContentRev, type BannerRow } from "@/lib/banners";
import {
  BannerFields,
  COLS,
  crossFieldError,
  migrationError,
  missingTable,
} from "@/lib/banners-api";

const Body = z.object({
  message: BannerFields.message.optional(),
  cta_label: BannerFields.cta_label.optional(),
  cta_href: BannerFields.cta_href.optional(),
  cta_href_guest: BannerFields.cta_href_guest.optional(),
  audience: BannerFields.audience.optional(),
  tone: BannerFields.tone.optional(),
  icon: BannerFields.icon.optional(),
  starts_at: BannerFields.starts_at.optional(),
  ends_at: BannerFields.ends_at.optional(),
  dismiss_days: BannerFields.dismiss_days.optional(),
  hide_when_answered: BannerFields.hide_when_answered.optional(),
  enabled: BannerFields.enabled.optional(),
  /** "Show it again to people who dismissed it" — forces a content bump. */
  bump_rev: z.boolean().optional(),
});

const FIELDS = [
  "message",
  "cta_label",
  "cta_href",
  "cta_href_guest",
  "audience",
  "tone",
  "icon",
  "starts_at",
  "ends_at",
  "dismiss_days",
  "hide_when_answered",
  "enabled",
] as const;

/**
 * Edit a banner. The on/off switch in the list is this same route with just
 * `{enabled}` — there's no separate endpoint, so toggling can't drift from
 * editing.
 */
export const PATCH = guarded(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePermission(req, "banners");
  const { id } = await ctx.params;
  const bannerId = Number(id);
  if (!Number.isInteger(bannerId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const f = parsed.data;

  // Read the row first: the cross-field rules and the content revision both
  // have to judge the merged result, not just the fields that came in.
  const current = await db().from("banners").select(COLS).eq("id", bannerId).maybeSingle();
  if (current.error) {
    if (missingTable(current.error.message)) return migrationError();
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!current.data) return NextResponse.json({ error: "No such banner" }, { status: 404 });
  const before = current.data as unknown as BannerRow;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };
  for (const k of FIELDS) if (f[k] !== undefined) patch[k] = f[k];
  if (Object.keys(patch).length === 2 && !f.bump_rev) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const problem = crossFieldError({ ...before, ...(patch as Partial<BannerRow>) });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  patch.content_rev = nextContentRev(before.content_rev, before, patch, f.bump_rev === true);

  const { data, error } = await db()
    .from("banners")
    .update(patch)
    .eq("id", bannerId)
    .select(COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such banner" }, { status: 404 });
  invalidateBanners();
  return NextResponse.json({ ok: true, banner: data });
});

export const DELETE = guarded(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(req, "banners");
  const { id } = await ctx.params;
  const bannerId = Number(id);
  if (!Number.isInteger(bannerId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const { error } = await db().from("banners").delete().eq("id", bannerId);
  if (error) {
    if (missingTable(error.message)) return migrationError();
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  invalidateBanners();
  return NextResponse.json({ ok: true });
});
