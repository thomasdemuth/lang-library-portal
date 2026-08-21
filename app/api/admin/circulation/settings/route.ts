import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, requirePermission } from "@/lib/guards";
import { DEFAULT_EMAIL_MODE, EMAIL_MODES, isEmailMode } from "@/lib/circulation";
import { getSetting, setSetting } from "@/lib/settings";

/** How the library mailbox hears about checkouts (per checkout / daily / off). */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "circulation");
  const stored = await getSetting<unknown>("circulation_email_mode", DEFAULT_EMAIL_MODE);
  return NextResponse.json({ emailMode: isEmailMode(stored) ? stored : DEFAULT_EMAIL_MODE });
});

const Body = z.object({ emailMode: z.enum(EMAIL_MODES) });

export const PATCH = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "circulation");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const ok = await setSetting("circulation_email_mode", parsed.data.emailMode, admin.id);
  if (!ok) {
    return NextResponse.json({ error: "Couldn't save — has migration 0026 been run?" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, emailMode: parsed.data.emailMode });
});
