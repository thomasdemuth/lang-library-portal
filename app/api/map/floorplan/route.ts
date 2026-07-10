import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";

/** Streams the floor plan image to any signed-in user. */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const { data: settings } = await db()
    .from("map_settings")
    .select("floorplan_path")
    .eq("id", 1)
    .maybeSingle();
  if (!settings?.floorplan_path) {
    return NextResponse.json({ error: "No floor plan uploaded yet" }, { status: 404 });
  }
  const { data, error } = await db().storage.from("library").download(settings.floorplan_path);
  if (error || !data) return NextResponse.json({ error: "Storage error" }, { status: 500 });

  return new NextResponse(data.stream(), {
    headers: {
      "Content-Type": data.type || "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
