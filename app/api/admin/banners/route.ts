import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { invalidateBanners } from "@/lib/banners-store";
import { BannerFields, COLS, crossFieldError, migrationError, missingTable } from "@/lib/banners-api";

const Body = z.object({
  message: BannerFields.message,
  cta_label: BannerFields.cta_label.optional(),
  cta_href: BannerFields.cta_href.optional(),
  cta_href_guest: BannerFields.cta_href_guest.optional(),
  audience: BannerFields.audience.default("all"),
  tone: BannerFields.tone.default("info"),
  icon: BannerFields.icon.default("sparkle"),
  starts_at: BannerFields.starts_at.optional(),
  ends_at: BannerFields.ends_at.optional(),
  dismiss_days: BannerFields.dismiss_days.default(30),
  hide_when_answered: BannerFields.hide_when_answered.default(false),
  // New banners start switched off, so nothing reaches the whole school by
  // accident while the wording is still being worked out.
  enabled: BannerFields.enabled.default(false),
});

/**
 * Every banner ever written, newest first. Reads the table directly rather
 * than through lib/banners-store's cache — an admin has to see their own edit
 * immediately, not up to a minute later.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "banners");
  const { data, error } = await db().from("banners").select(COLS).order("id", { ascending: false });
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ banners: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json(
    { banners: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

export const POST = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "banners");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const problem = crossFieldError(parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data, error } = await db()
    .from("banners")
    .insert({ ...parsed.data, content_rev: 1, updated_by: admin.id })
    .select(COLS)
    .single();
  if (error) {
    if (missingTable(error.message)) return migrationError();
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  invalidateBanners();
  return NextResponse.json({ ok: true, banner: data });
});
