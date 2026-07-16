import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { AVATAR_ITEMS, DEFAULT_AVATAR, ITEM_BY_ID, ownsItem, type Avatar } from "@/lib/play";

function migrationPending(message: string | undefined): boolean {
  return /student_profiles|reading_log|relation|does not exist/i.test(message ?? "");
}

type ProfileRow = {
  email: string;
  avatar: Avatar;
  owned: string[];
  points: number;
  public_id?: string;
  hidden?: boolean;
};

async function loadProfile(email: string): Promise<ProfileRow | "missing-table" | null> {
  // public_id / hidden arrive with migrations 0012/0013 — retry without them
  let { data, error } = await db()
    .from("student_profiles")
    .select("email, avatar, owned, points, public_id, hidden")
    .eq("email", email)
    .maybeSingle();
  if (error && /public_id|hidden/i.test(error.message ?? "")) {
    ({ data, error } = await db()
      .from("student_profiles")
      .select("email, avatar, owned, points")
      .eq("email", email)
      .maybeSingle());
  }
  if (error) return migrationPending(error.message) ? "missing-table" : null;
  if (data) return data as ProfileRow;
  const fresh = { email, avatar: DEFAULT_AVATAR, owned: [], points: 0 };
  const { error: insErr } = await db().from("student_profiles").insert(fresh);
  if (insErr && !/duplicate/i.test(insErr.message ?? "")) {
    return migrationPending(insErr.message) ? "missing-table" : null;
  }
  return fresh;
}

/** My profile: avatar, owned items, points, and books-read count. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const profile = await loadProfile(session.email);
  if (profile === "missing-table") {
    return NextResponse.json({ profile: null, migrationPending: true });
  }
  if (!profile) return NextResponse.json({ error: "Database error" }, { status: 500 });

  let booksRead = 0;
  try {
    const { count } = await db()
      .from("reading_log")
      .select("id", { count: "exact", head: true })
      .eq("email", session.email);
    booksRead = count ?? 0;
  } catch {
    /* pre-migration */
  }
  return NextResponse.json({ profile, booksRead, catalog: AVATAR_ITEMS });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), id: z.string().max(40) }),
  z.object({
    action: z.literal("equip"),
    slot: z.enum(["bg", "legs", "body", "outfit", "head", "face", "hat"]),
    id: z.string().max(40).nullable(),
  }),
  z.object({ action: z.literal("privacy"), hidden: z.boolean() }),
]);

/** Buy an item with stars, or equip/unequip an owned one. */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const profile = await loadProfile(session.email);
  if (profile === "missing-table") {
    return NextResponse.json({ error: "The game needs a pending database migration (0011)." }, { status: 409 });
  }
  if (!profile) return NextResponse.json({ error: "Database error" }, { status: 500 });

  if (parsed.data.action === "buy") {
    const item = ITEM_BY_ID.get(parsed.data.id);
    if (!item) return NextResponse.json({ error: "No such item" }, { status: 400 });
    if (ownsItem(profile.owned, item)) return NextResponse.json({ error: "Already owned" }, { status: 400 });
    if (profile.points < item.price) {
      return NextResponse.json({ error: `You need ${item.price - profile.points} more stars for that.` }, { status: 400 });
    }
    const owned = [...profile.owned, item.id];
    const points = profile.points - item.price;
    const { error } = await db()
      .from("student_profiles")
      .update({ owned, points })
      .eq("email", session.email)
      .eq("points", profile.points); // no double-spend on rapid taps
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true, owned, points });
  }

  if (parsed.data.action === "privacy") {
    const { error } = await db()
      .from("student_profiles")
      .update({ hidden: parsed.data.hidden })
      .eq("email", session.email);
    if (error) {
      if (/hidden|schema cache/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "Profile privacy unlocks after the next library update!" }, { status: 409 });
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, hidden: parsed.data.hidden });
  }

  // equip
  const { slot, id } = parsed.data;
  if (id !== null) {
    const item = ITEM_BY_ID.get(id);
    if (!item || item.slot !== slot) return NextResponse.json({ error: "No such item" }, { status: 400 });
    if (!ownsItem(profile.owned, item)) return NextResponse.json({ error: "Not owned yet" }, { status: 400 });
  }
  if (id === null && ["bg", "legs", "body", "head"].includes(slot)) {
    return NextResponse.json({ error: "That part can't come off — pick a different one instead." }, { status: 400 });
  }
  const avatar: Avatar = { ...profile.avatar, [slot]: id ?? undefined };
  if (slot === "head") delete avatar.base; // retire the legacy key once a head is chosen
  const { error } = await db().from("student_profiles").update({ avatar }).eq("email", session.email);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, avatar });
});
