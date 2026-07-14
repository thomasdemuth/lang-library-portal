import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";
import { canPublishUpdates, pushUpdateToAdmins } from "@/lib/updates";

/** The update feed — visible to every admin. */
export const GET = guarded(async (req: NextRequest) => {
  await requireAdmin(req);
  const { data, error } = await db()
    .from("app_updates")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (/app_updates|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ updates: [], migrationPending: true });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ updates: data ?? [] });
});

const Body = z.object({
  title: z.string().trim().min(1, "Give the update a title.").max(120),
  body: z.string().trim().min(1, "Write the update.").max(2000),
  override: z.boolean().optional(),
});

/** Publish an update and push it to admins' devices (author only). */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!canPublishUpdates(admin.email)) {
    return NextResponse.json({ error: "Only the app developer can publish updates." }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { title, body, override } = parsed.data;

  const { data: inserted, error } = await db()
    .from("app_updates")
    .insert({ title, body, created_by: admin.id })
    .select("id, title, body, created_at")
    .single();
  if (error) {
    if (/app_updates|relation|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json(
        { error: "Updates need the pending database migration — run 0009 in Supabase." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const push = await pushUpdateToAdmins(title, body, Boolean(override));
  return NextResponse.json({ ok: true, update: inserted, push });
});
