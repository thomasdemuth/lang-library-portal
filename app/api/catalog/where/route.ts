import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { whereIsBook } from "@/lib/catalog";

/** Which shelf is this book on? (Student/teacher flavor — read-only.) */
export const GET = guarded(async (req: NextRequest) => {
  await requireSession(req);
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });
  const result = await whereIsBook(key);
  if ("error" in result) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
});
