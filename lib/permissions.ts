/**
 * Admin roles and the granular powers a Chief can grant to a regular Admin.
 * Chief Admins implicitly have every power plus the reserved actions
 * (managing admins, creating invites, and deleting records) that can never
 * be granted to a regular Admin.
 */
export type AdminRole = "chief" | "admin";

export const PERMISSIONS = [
  { key: "map_edit", label: "Map editing", group: "Map", desc: "Build & edit shelves, categories, internal notes." },
  { key: "map_floorplan", label: "Upload floor plan", group: "Map", desc: "Replace the background floor-plan image." },
  { key: "requests", label: "Book requests", group: "Requests", desc: "View requests and set status/notes." },
  { key: "feedback_view", label: "Feedback viewing", group: "Feedback", desc: "Read student & teacher feedback." },
  { key: "feedback_manage", label: "Manage feedback status", group: "Feedback", desc: "Mark feedback read / archived." },
  { key: "inventory_view", label: "Inventory (search)", group: "Inventory", desc: "Search the catalog & see sync history." },
  { key: "inventory_import", label: "Manage inventory imports", group: "Inventory", desc: "Replace the catalog via Libib CSV." },
  { key: "games", label: "Games inventory", group: "Games", desc: "Add, edit, categorize, and remove games." },
  { key: "signmaker", label: "Sign maker", group: "Tools", desc: "Use the sign generator." },
  { key: "analytics", label: "Site usage", group: "Tools", desc: "View the analytics dashboard." },
  { key: "users", label: "User insights", group: "Tools", desc: "See student & teacher accounts, activity, and notes." },
] as const;

export type PermKey = (typeof PERMISSIONS)[number]["key"];
export const PERM_KEYS = PERMISSIONS.map((p) => p.key) as PermKey[];

/**
 * The developer account(s). A few tools are theirs alone regardless of
 * role or granted powers — the Libib CSV import and publishing app
 * updates. Both spellings of Thomas's address are accepted (the admin
 * account currently uses the students-domain one).
 */
export const DEVELOPER_EMAILS = new Set([
  "thomas.demuth@thelangschool.org",
  "thomas.demuth@students.thelangschool.org",
]);

export function isDeveloper(email: string | null | undefined): boolean {
  return !!email && DEVELOPER_EMAILS.has(email.toLowerCase());
}

export type AdminLike = { role: AdminRole; permissions?: Record<string, boolean> | null };

/** Whether an admin may perform an action. Chief can do everything. */
export function canDo(admin: AdminLike, key: PermKey): boolean {
  return admin.role === "chief" || admin.permissions?.[key] === true;
}

/** Sanitize an arbitrary permissions object down to known keys → booleans. */
export function cleanPermissions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (input && typeof input === "object") {
    for (const key of PERM_KEYS) {
      if ((input as Record<string, unknown>)[key] === true) out[key] = true;
    }
  }
  return out;
}
