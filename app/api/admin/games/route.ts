import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requirePermission } from "@/lib/guards";
import { GAME_SUBCATEGORY_IDS, normalizeGameTitle } from "@/lib/games";

const COLS = "id, title, subcategory, description, image_url, copies, condition, location, available";
const SUBCATS = GAME_SUBCATEGORY_IDS as [string, ...string[]];

function missingTable(message: string | undefined): boolean {
  return /games|relation|does not exist|schema cache/i.test(message ?? "");
}
const migrationError = () =>
  NextResponse.json({ error: "Games need migration 0017 — run it in the Supabase SQL editor." }, { status: 409 });

/** Management list: search + filter by sub-category. */
export const GET = guarded(async (req: NextRequest) => {
  await requirePermission(req, "games");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const sub = req.nextUrl.searchParams.get("subcategory");

  let query = db().from("games").select(COLS).order("title");
  const norm = normalizeGameTitle(q);
  if (norm) query = query.ilike("title_norm", `%${norm}%`);
  if (sub && (SUBCATS as string[]).includes(sub)) query = query.eq("subcategory", sub);

  const { data, error } = await query;
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ games: [], migrationPending: true });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ games: data ?? [] });
});

const nz = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const Body = z.object({
  title: z.string().trim().min(1, "Enter a title").max(300),
  subcategory: z.enum(SUBCATS).default("other"),
  description: nz(5000).optional(),
  image_url: nz(1000).optional(),
  copies: z.number().int().min(0).max(9999).default(1),
  condition: nz(120).optional(),
  location: nz(300).optional(),
  available: z.boolean().default(true),
});

/** Add a new game. */
export const POST = guarded(async (req: NextRequest) => {
  const admin = await requirePermission(req, "games");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const g = parsed.data;
  const { data, error } = await db()
    .from("games")
    .insert({
      title: g.title,
      subcategory: g.subcategory,
      description: g.description ?? null,
      image_url: g.image_url ?? null,
      copies: g.copies,
      condition: g.condition ?? null,
      location: g.location ?? null,
      available: g.available,
      title_norm: normalizeGameTitle(g.title),
      updated_by: admin.id,
    })
    .select(COLS)
    .single();
  if (error) {
    if (missingTable(error.message)) return migrationError();
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, game: data });
});
