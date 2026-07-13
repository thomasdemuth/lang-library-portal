import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import ScanPanel from "@/components/ScanPanel";

export const dynamic = "force-dynamic";

/** The Scan tab: the scanner fills the screen above the tab bar. */
export default async function ScanPage() {
  const admin = await requireAdminPage();
  const canView = canDo(admin, "inventory_view");
  const canImport = canDo(admin, "inventory_import");
  if (!canView && !canImport) redirect("/admin");

  return <ScanPanel canImport={canImport} variant="page" />;
}
