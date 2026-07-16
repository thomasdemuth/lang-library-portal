import InventoryPanel from "@/components/InventoryPanel";
import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function InventoryPage() {
  const admin = await requireAdminPage();
  const canImport = canDo(admin, "inventory_import");
  const canView = canDo(admin, "inventory_view");
  if (!canImport && !canView) redirect("/admin");

  return (
    <>
      <h1>Inventory</h1>
      <p className="sub">
        The book catalog, synced from Libib by CSV export. Book requests are matched against
        whatever is live here.
      </p>
      <a className="btn brand mobile-only" style={{ width: "100%", textAlign: "center", marginBottom: 14 }} href="/admin/requests">
        Manage Book Requests
      </a>
      <InventoryPanel canImport={canImport} />
    </>
  );
}
