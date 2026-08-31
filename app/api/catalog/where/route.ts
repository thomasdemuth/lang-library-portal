import { NextRequest, NextResponse } from "next/server";
import { guarded, requireSession } from "@/lib/guards";
import { hidesTeacherBooks } from "@/lib/tags";
import { whereIsBook } from "@/lib/catalog";

/** Which shelf is this book on? (Student/teacher flavor — read-only.) */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  const key = (req.nextUrl.searchParams.get("key") ?? "").slice(0, 600);
  if (!key) return NextResponse.json({ error: "Missing book key" }, { status: 400 });
  // A student asking where a teacher book lives is answered "we don't have
  // it" — the same answer as for a book the library really doesn't own.
  const result = await whereIsBook(key, hidesTeacherBooks(session.aud) ? "hide" : "all");
  if ("error" in result) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
});
