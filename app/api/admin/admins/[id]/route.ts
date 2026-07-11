import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireChief } from "@/lib/guards";
import { cleanPermissions } from "@/lib/permissions";

const Body = z.object({
  disabled: z.boolean().optional(),
  role: z.enum(["chief", "admin"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

function isMissingColumn(message: string | undefined): boolean {
  return /role|permissions|column/i.test(message ?? "");
}

/**
 * Chief-only: enable/disable an admin, change their role, or set their powers.
 * You can't disable yourself, and the library must always keep at least one
 * active Chief Admin.
 *
 * Resilient to migration 0004 (role/permissions columns) not having run yet:
 * every admin behaves as an implicit Chief in that case, matching the guard
 * fallback used everywhere else, and role/permissions writes are dropped.
 */
export const PATCH = guarded(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireChief(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const { disabled, role, permissions } = parsed.data;

    if (id === admin.id && disabled === true) {
      return NextResponse.json({ error: "You can't disable your own account." }, { status: 400 });
    }

    let hasRoleColumn = true;
    let read = await db().from("admins").select("id, role, disabled_at, session_v").eq("id", id).maybeSingle();
    if (read.error && isMissingColumn(read.error.message)) {
      hasRoleColumn = false;
      read = await db().from("admins").select("id, disabled_at, session_v").eq("id", id).maybeSingle();
    }
    if (read.error || !read.data) return NextResponse.json({ error: "No such admin" }, { status: 404 });
    const target = read.data as { role?: "chief" | "admin"; disabled_at: string | null; session_v: number };
    const targetRole = target.role ?? "chief";

    const newRole = role ?? targetRole;
    const newDisabled = disabled ?? Boolean(target.disabled_at);

    // The library must retain at least one active Chief Admin.
    if (hasRoleColumn && targetRole === "chief" && (newRole !== "chief" || newDisabled)) {
      const { count } = await db()
        .from("admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "chief")
        .is("disabled_at", null)
        .neq("id", id);
      if ((count ?? 0) === 0) {
        return NextResponse.json(
          { error: "At least one active Chief Admin must remain." },
          { status: 400 }
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (disabled !== undefined) {
      patch.disabled_at = disabled ? new Date().toISOString() : null;
      patch.session_v = target.session_v + 1; // kill existing sessions on disable
    }
    if (hasRoleColumn) {
      if (role !== undefined) {
        patch.role = newRole;
        // Chiefs hold every power implicitly; clear the flags for tidiness.
        if (newRole === "chief") patch.permissions = {};
      }
      if (permissions !== undefined && newRole !== "chief") {
        patch.permissions = cleanPermissions(permissions);
      }
    }
    if (Object.keys(patch).length === 0) {
      if (!hasRoleColumn && (role !== undefined || permissions !== undefined)) {
        return NextResponse.json(
          { error: "Roles aren't set up yet — ask an admin to run the pending database migration." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await db().from("admins").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
);
