import InventoryPanel from "@/components/InventoryPanel";

export default function InventoryPage() {
  return (
    <>
      <h1>Inventory</h1>
      <p className="sub">
        The book catalog, synced from Libib by CSV export. Book requests are matched against
        whatever is live here.
      </p>
      <InventoryPanel />
    </>
  );
}
