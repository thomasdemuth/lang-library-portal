import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import MobileTabBar from "@/components/MobileTabBar";
import MobileHeader from "@/components/MobileHeader";
import MobileUndo from "@/components/MobileUndo";
import SideNav from "@/components/SideNav";
import Shortcuts from "@/components/Shortcuts";
import { navShortcutsFor } from "@/lib/shortcuts";
import { canPublishUpdates } from "@/lib/updates";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  const isChief = admin.role === "chief";
  const libraryLinks = [
    { href: "/admin", label: "Dashboard", icon: "home", show: true },
    { href: "/admin/requests", label: "Book Requests", icon: "requests", show: canDo(admin, "requests") },
    { href: "/admin/circulation", label: "Circulation", icon: "backpack", show: canDo(admin, "circulation") },
    { href: "/admin/feedback", label: "Feedback", icon: "feedback", show: canDo(admin, "feedback_view") },
    {
      href: "/admin/inventory",
      label: "Inventory",
      icon: "book",
      show: canDo(admin, "inventory_view") || canDo(admin, "inventory_import"),
    },
    { href: "/admin/games", label: "Games", icon: "dice", show: canDo(admin, "games") },
    {
      href: "/admin/map",
      label: "Map Editor",
      icon: "map",
      show: canDo(admin, "map_edit") || canDo(admin, "map_floorplan"),
    },
  ].filter((l) => l.show);
  const toolLinks = [
    { href: "/admin/sign-maker", label: "Sign Maker", icon: "sign", show: canDo(admin, "signmaker") },
    { href: "/admin/site-tools", label: "Site Tools", icon: "sparkle", show: canDo(admin, "banners") },
    { href: "/admin/analytics", label: "Site Usage", icon: "chart", show: canDo(admin, "analytics") },
    { href: "/admin/users", label: "User Insights", icon: "users", show: canDo(admin, "users") },
    { href: "/admin/updates", label: "Updates", icon: "megaphone", show: canPublishUpdates(admin.email) },
  ].filter((l) => l.show);
  const accountLinks = [
    ...(isChief ? [{ href: "/admin/admins", label: "Admins & Invites", icon: "users" }] : []),
    { href: "/admin/account", label: "My Account", icon: "gear" },
  ];

  return (
    <div className="admin-grid">
      <Shortcuts links={navShortcutsFor(admin)} />
      <MobileUndo />
      {/* This shell renders INSIDE app/staff/layout.tsx, which already owns
          the page's single <main id="main">. So the content column stays a
          <div> (nested <main> is invalid, and a second id="main" would be a
          duplicate) and gets its own skip link — the one worth having here,
          since it clears the sidebar the outer link lands in front of. */}
      <a className="skip-link" href="#admin-content">
        Skip past navigation
      </a>
      <SideNav library={libraryLinks} tools={toolLinks} account={accountLinks} />
      <div className="admin-main" id="admin-content">
        <MobileHeader />
        {children}
      </div>
      <MobileTabBar
        canScan={canDo(admin, "inventory_view") || canDo(admin, "inventory_import")}
        canInventory={canDo(admin, "inventory_view") || canDo(admin, "inventory_import")}
        canMap={canDo(admin, "map_edit") || canDo(admin, "map_floorplan")}
      />
    </div>
  );
}
