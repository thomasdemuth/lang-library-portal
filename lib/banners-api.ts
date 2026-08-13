import { NextResponse } from "next/server";
import { z } from "zod";
import { AUDIENCES, ICONS, isAllowedHref, TONES } from "@/lib/banners";

/**
 * Shared shape for the two banner admin routes. It lives here rather than in
 * app/api/admin/banners/route.ts because a Next route file may only export
 * handlers — anything else fails the build's route-type check.
 */

export const COLS =
  "id, message, cta_label, cta_href, cta_href_guest, audience, tone, icon, enabled, " +
  "starts_at, ends_at, dismiss_days, hide_when_answered, legacy_key, content_rev, " +
  "created_at, updated_at";

/** The `banners` table doesn't exist yet — migration 0025 hasn't been run. */
export function missingTable(message: string | undefined): boolean {
  return /banners|relation|does not exist|schema cache/i.test(message ?? "");
}

export const migrationError = () =>
  NextResponse.json(
    { error: "Banners need migration 0025 — run it in the Supabase SQL editor." },
    { status: 409 }
  );

/** Empty string → null, so clearing a field clears the column. */
const nz = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/**
 * A link may point somewhere on this site or at an https URL — nothing else.
 * This is the one field an admin types that ends up on every page of the site,
 * so a typo turning into a `javascript:` link is worth refusing at the door.
 */
export const hrefField = nz(500).refine((v) => v === null || isAllowedHref(v), {
  message: "Links must start with / or https://",
});

export const isoOrNull = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((v) => v ?? null);

export const BannerFields = {
  message: z.string().trim().min(1, "Write the message").max(300),
  cta_label: nz(60),
  cta_href: hrefField,
  cta_href_guest: hrefField,
  audience: z.enum(AUDIENCES),
  tone: z.enum(TONES),
  icon: z.enum(ICONS),
  starts_at: isoOrNull,
  ends_at: isoOrNull,
  dismiss_days: z.number().int().min(0).max(365),
  hide_when_answered: z.boolean(),
  enabled: z.boolean(),
};

/** Rules that need more than one field to judge. */
export function crossFieldError(b: {
  starts_at?: string | null;
  ends_at?: string | null;
  cta_label?: string | null;
  cta_href?: string | null;
}): string | null {
  if (b.starts_at && b.ends_at && Date.parse(b.ends_at) <= Date.parse(b.starts_at)) {
    return "The end date has to be after the start date.";
  }
  if (b.cta_label && !b.cta_href) return "A call-to-action needs a link to go with it.";
  return null;
}
