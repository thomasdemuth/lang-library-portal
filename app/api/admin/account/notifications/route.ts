import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const Body = z.object({
  notify_requests: z.boolean().optional(),
  notify_weekly: z.boolean().nullable().optional(),
  notify_updates: z.boolean().nullable().optional(),
});

/** Self-service email preferences (any admin, own row only). */
export const PATCH = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (
    !parsed.success ||
    (parsed.data.notify_requests === undefined &&
      parsed.data.notify_weekly === undefined &&
      parsed.data.notify_updates === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.notify_requests !== undefined) patch.notify_requests = parsed.data.notify_requests;
  if (parsed.data.notify_weekly !== undefined) patch.notify_weekly = parsed.data.notify_weekly;
  if (parsed.data.notify_updates !== undefined) patch.notify_updates = parsed.data.notify_updates;

  let { error } = await db().from("admins").update(patch).eq("id", admin.id);
  // Pre-migration (0005 notify_weekly / 0009 notify_updates): retry with
  // just the columns that exist everywhere.
  if (error && /notify_updates|column/i.test(error.message ?? "") && parsed.data.notify_updates !== undefined) {
    return NextResponse.json(
      { error: "Update announcements need a pending database migration first (0009)." },
      { status: 409 }
    );
  }
  if (error && /notify_weekly|column/i.test(error.message ?? "")) {
    if (parsed.data.notify_requests !== undefined) {
      ({ error } = await db()
        .from("admins")
        .update({ notify_requests: parsed.data.notify_requests })
        .eq("id", admin.id));
      if (!error && parsed.data.notify_weekly !== undefined) {
        return NextResponse.json(
          { error: "Saved the request alerts setting, but the weekly-summary preference needs a pending database migration first." },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "The weekly-summary preference needs a pending database migration first." },
        { status: 409 }
      );
    }
  }
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
});
