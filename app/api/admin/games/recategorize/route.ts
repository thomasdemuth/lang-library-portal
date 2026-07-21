import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { GAME_SUBCATEGORY_IDS } from "@/lib/games";

const SUBCATS = GAME_SUBCATEGORY_IDS as [string, ...string[]];

const Body = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  subcategory: z.enum(SUBCATS),
});

/** Move many games into one sub-category at once (bulk re-categorize). */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "games");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { ids, subcategory } = parsed.data;

  const { error } = await db()
    .from("games")
    .update({ subcategory, updated_at: new Date().toISOString(), updated_by: admin.id })
    .in("id", ids);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, count: ids.length, subcategory });
});
