import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { GAME_SUBCATEGORY_IDS, normalizeGameTitle } from "@/lib/games";

const COLS = "id, title, subcategory, description, image_url, copies, condition, location, available";
const SUBCATS = GAME_SUBCATEGORY_IDS as [string, ...string[]];

const nz = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const Body = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  subcategory: z.enum(SUBCATS).optional(),
  description: nz(5000).optional(),
  image_url: nz(1000).optional(),
  copies: z.number().int().min(0).max(9999).optional(),
  condition: nz(120).optional(),
  location: nz(300).optional(),
  available: z.boolean().optional(),
});

/** Edit a game's fields (including its sub-category). */
export const PATCH = guarded(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePermission(req, "games");
  const { id } = await ctx.params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const f = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: admin.id };
  if (f.title !== undefined) {
    patch.title = f.title;
    patch.title_norm = normalizeGameTitle(f.title);
  }
  for (const k of ["subcategory", "description", "image_url", "copies", "condition", "location", "available"] as const) {
    if (f[k] !== undefined) patch[k] = f[k];
  }
  if (Object.keys(patch).length === 2) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await db().from("games").update(patch).eq("id", gameId).select(COLS).maybeSingle();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such game" }, { status: 404 });
  return NextResponse.json({ ok: true, game: data });
});

/** Remove a game. */
export const DELETE = guarded(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(req, "games");
  const { id } = await ctx.params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const { error } = await db().from("games").delete().eq("id", gameId);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
});
