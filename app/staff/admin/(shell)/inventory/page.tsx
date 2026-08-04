import InventoryPanel from "@/components/InventoryPanel";
import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { withBase } from "@/lib/base";

export default async function InventoryPage() {
  const admin = await requireAdminPage();
  // The Libib import (and restore) is a grantable power like the rest:
  // Chiefs always have it, regular admins when a Chief grants
  // "inventory_import" — it is no longer reserved to the developer account.
  const canImport = canDo(admin, "inventory_import");
  const canView = canDo(admin, "inventory_view");
  if (!canImport && !canView) redirect("/admin");

  return (
    <>
      <h1>Inventory</h1>
      <p className="sub">
        The book catalog. Book requests are matched against whatever is live here.
      </p>
      <a className="btn brand mobile-only" style={{ width: "100%", textAlign: "center", marginBottom: 14 }} href={withBase("/admin/requests")}>
        Manage Book Requests
      </a>
      <InventoryPanel canImport={canImport} />
    </>
  );
}
