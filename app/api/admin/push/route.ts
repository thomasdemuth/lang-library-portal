import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { pushConfigured } from "@/lib/updates";

/** The public VAPID key the browser needs to subscribe. */
export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  if (!pushConfigured()) return NextResponse.json({ publicKey: null });
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

const SubBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});

/** Register this device for push notifications. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = SubBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { error } = await db().from("push_subscriptions").upsert(
    {
      admin_id: admin.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    if (/push_subscriptions|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json(
        { error: "Notifications need the pending database migration — run 0009 in Supabase." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
});

const UnsubBody = z.object({ endpoint: z.string().url().max(1000) });

/** Remove this device's push registration. */
export const DELETE = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const parsed = UnsubBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db()
    .from("push_subscriptions")
    .delete()
    .eq("admin_id", admin.id)
    .eq("endpoint", parsed.data.endpoint);
  return NextResponse.json({ ok: true });
});
