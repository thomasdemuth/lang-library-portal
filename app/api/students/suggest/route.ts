import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, requireStaff } from "@/lib/guards";
import { displayNameFull } from "@/lib/play";

/**
 * Teacher-only typeahead for "check out for a student": matches known
 * student accounts (anyone who has signed in) by name or email. A student
 * who has never used the site simply won't suggest — the checkout form
 * accepts a typed school email for exactly that case.
 */
export const GET = guarded(async (req: NextRequest) => {
  await requireStaff(req);
  const raw = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  // School emails are first.last; typed names are "first last". Reduce both
  // to the email's local-part shape, and drop every LIKE metacharacter so
  // the pattern below is all-literal.
  const q = raw.replace(/\s+/g, ".").replace(/[^a-z0-9.-]/g, "");
  if (q.length < 2) return NextResponse.json({ students: [] });

  const { data, error } = await db()
    .from("student_profiles")
    .select("email")
    .ilike("email", `%${q}%`)
    .order("email")
    .limit(8);
  if (error) return NextResponse.json({ students: [] });
  const students = (data ?? []).map((r) => ({
    email: r.email as string,
    name: displayNameFull(r.email as string),
  }));
  return NextResponse.json({ students });
});
