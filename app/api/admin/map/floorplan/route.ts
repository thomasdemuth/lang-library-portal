import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireAdmin } from "@/lib/guards";

const MAX_BYTES = 4 * 1024 * 1024; // stay under Vercel's request limit
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Upload/replace the floor plan. Raw image body; intrinsic dimensions are
 * read client-side and passed as query params (?w=&h=). Clients downscale
 * to ≤4096px before uploading.
 */
export const PUT = guarded(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const type = req.headers.get("content-type") ?? "";
  if (!TYPES.has(type)) {
    return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP image." }, { status: 415 });
  }
  const w = parseInt(req.nextUrl.searchParams.get("w") ?? "", 10);
  const h = parseInt(req.nextUrl.searchParams.get("h") ?? "", 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 100 || h < 100 || w > 20000 || h > 20000) {
    return NextResponse.json({ error: "Missing image dimensions." }, { status: 400 });
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 4 MB." }, { status: 413 });
  }

  // Bucket is created lazily; ignore "already exists"
  await db()
    .storage.createBucket("library", { public: false })
    .catch(() => undefined);

  const path = `floorplan/current`;
  const { error: upErr } = await db()
    .storage.from("library")
    .upload(path, bytes, { contentType: type, upsert: true });
  if (upErr) return NextResponse.json({ error: "Storage error" }, { status: 500 });

  const { error } = await db()
    .from("map_settings")
    .update({
      floorplan_path: path,
      floorplan_width: w,
      floorplan_height: h,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ ok: true, width: w, height: h });
});
