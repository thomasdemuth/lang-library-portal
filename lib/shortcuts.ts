import { canDo, type AdminLike } from "@/lib/permissions";

/**
 * Alt/Option + a number jumps to a management page. The numbers are fixed
 * per destination — they don't renumber to close gaps when an admin lacks
 * a power — so the same key always means the same page for everyone.
 */
export type NavShortcut = { key: string; href: string; label: string };

/** Every jump, with the check that decides whether this admin gets it. */
const ALL: (NavShortcut & { allow: (a: AdminLike & { role: string }) => boolean })[] = [
  { key: "1", href: "/admin/requests", label: "Book Requests", allow: (a) => canDo(a, "requests") },
  { key: "2", href: "/admin/feedback", label: "Feedback", allow: (a) => canDo(a, "feedback_view") },
  {
    key: "3",
    href: "/admin/inventory",
    label: "Inventory",
    allow: (a) => canDo(a, "inventory_view") || canDo(a, "inventory_import"),
  },
  {
    key: "4",
    href: "/admin/map",
    label: "Map Editor",
    allow: (a) => canDo(a, "map_edit") || canDo(a, "map_floorplan"),
  },
  { key: "5", href: "/admin/sign-maker", label: "Sign Maker", allow: (a) => canDo(a, "signmaker") },
  { key: "6", href: "/admin/analytics", label: "Site Usage", allow: (a) => canDo(a, "analytics") },
  { key: "7", href: "/admin/users", label: "User Insights", allow: (a) => canDo(a, "users") },
  { key: "8", href: "/admin/admins", label: "Admins & Invites", allow: (a) => a.role === "chief" },
  { key: "9", href: "/admin/account", label: "My Account", allow: () => true },
];

/** The jumps this admin can actually use (the rest would just 403). */
export function navShortcutsFor(admin: AdminLike & { role: string }): NavShortcut[] {
  return ALL.filter((s) => s.allow(admin)).map(({ key, href, label }) => ({ key, href, label }));
}

/** localStorage key for the per-device on/off switch. */
export const SHORTCUTS_PREF = "ll-shortcuts";

export function shortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(SHORTCUTS_PREF) !== "off";
  } catch {
    return true;
  }
}
