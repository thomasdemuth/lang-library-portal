import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import MobileTabBar from "@/components/MobileTabBar";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import { canPublishUpdates } from "@/lib/updates";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  const isChief = admin.role === "chief";
  const libraryLinks = [
    { href: "/admin", label: "Dashboard", icon: "home", show: true },
    { href: "/admin/requests", label: "Book Requests", icon: "requests", show: canDo(admin, "requests") },
    { href: "/admin/feedback", label: "Feedback", icon: "feedback", show: canDo(admin, "feedback_view") },
    {
      href: "/admin/inventory",
      label: "Inventory",
      icon: "book",
      show: canDo(admin, "inventory_view") || canDo(admin, "inventory_import"),
    },
    {
      href: "/admin/map",
      label: "Map Editor",
      icon: "map",
      show: canDo(admin, "map_edit") || canDo(admin, "map_floorplan"),
    },
  ].filter((l) => l.show);
  const toolLinks = [
    { href: "/admin/sign-maker", label: "Sign Maker", icon: "sign", show: canDo(admin, "signmaker") },
    { href: "/admin/analytics", label: "Site Usage", icon: "chart", show: canDo(admin, "analytics") },
    { href: "/admin/updates", label: "Updates", icon: "megaphone", show: canPublishUpdates(admin.email) },
  ].filter((l) => l.show);
  const accountLinks = [
    ...(isChief ? [{ href: "/admin/admins", label: "Admins & Invites", icon: "users" }] : []),
    { href: "/admin/account", label: "My Account", icon: "gear" },
  ];

  return (
    <div className="admin-grid">
      <SideNav library={libraryLinks} tools={toolLinks} account={accountLinks} />
      <main className="admin-main">
        <MobileHeader />
        {children}
      </main>
      <MobileTabBar
        canScan={canDo(admin, "inventory_view") || canDo(admin, "inventory_import")}
        canInventory={canDo(admin, "inventory_view") || canDo(admin, "inventory_import")}
        canMap={canDo(admin, "map_edit") || canDo(admin, "map_floorplan")}
      />
    </div>
  );
}
