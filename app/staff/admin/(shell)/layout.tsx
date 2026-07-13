import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import MobileTabBar from "@/components/MobileTabBar";
import MobileHeader from "@/components/MobileHeader";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  const isChief = admin.role === "chief";
  const libraryLinks = [
    { href: "/admin/requests", label: "Book Requests", show: canDo(admin, "requests") },
    { href: "/admin/feedback", label: "Feedback", show: canDo(admin, "feedback_view") },
    {
      href: "/admin/inventory",
      label: "Inventory",
      show: canDo(admin, "inventory_view") || canDo(admin, "inventory_import"),
    },
    {
      href: "/admin/map",
      label: "Map Editor",
      show: canDo(admin, "map_edit") || canDo(admin, "map_floorplan"),
    },
  ].filter((l) => l.show);
  const toolLinks = [
    { href: "/admin/sign-maker", label: "Sign Maker", show: canDo(admin, "signmaker") },
    { href: "/admin/analytics", label: "Site Usage", show: canDo(admin, "analytics") },
  ].filter((l) => l.show);

  return (
    <div className="admin-grid">
      <aside className="side">
        <span className="side-label">Library</span>
        <a href="/admin">Dashboard</a>
        {libraryLinks.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
        {toolLinks.length > 0 && <span className="side-label">Tools</span>}
        {toolLinks.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
        <span className="side-label">Account</span>
        {isChief && <a href="/admin/admins">Admins &amp; Invites</a>}
        <a href="/admin/account">My Account</a>
      </aside>
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
