import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";

const Row = z.object({
  title: z.string().min(1).max(500),
  creators: z.string().max(500).nullable(),
  isbn13: z.string().max(20).nullable(),
  isbn10: z.string().max(20).nullable(),
  publisher: z.string().max(300).nullable(),
  publish_date: z.string().max(50).nullable(),
  description: z.string().max(5000).nullable(),
  notes: z.string().max(2000).nullable(),
  group_name: z.string().max(300).nullable(),
  tags: z.string().max(1000).nullable(),
  item_type: z.string().max(50).nullable(),
  copies: z.number().int().min(0).max(999),
  title_norm: z.string().min(1).max(500),
  creators_norm: z.string().max(500).nullable(),
  dedupe_key: z.string().min(1).max(600),
});
const Body = z.object({ rows: z.array(Row).min(1).max(600) });

/** Receive one batch of pre-normalized, pre-merged rows for a pending sync. */
export const POST = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission(req, "inventory_import");
    const { id } = await ctx.params;
    const syncId = Number(id);
    if (!Number.isInteger(syncId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid rows payload" }, { status: 400 });
    }

    const { data: sync } = await db()
      .from("inventory_syncs")
      .select("id, status")
      .eq("id", syncId)
      .maybeSingle();
    if (!sync || sync.status !== "pending") {
      return NextResponse.json({ error: "That import is no longer open" }, { status: 409 });
    }

    // ignoreDuplicates makes batch retries safe (client already merged the file)
    const { error } = await db()
      .from("books")
      .upsert(
        parsed.data.rows.map((r) => ({ ...r, sync_id: syncId })),
        { onConflict: "sync_id,dedupe_key", ignoreDuplicates: true }
      );
    if (error) {
      if (/column/i.test(error.message ?? "") && /(description|notes)/.test(error.message ?? "")) {
        return NextResponse.json(
          { error: "Imports need the pending database migration — run 0010 in Supabase." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
);
