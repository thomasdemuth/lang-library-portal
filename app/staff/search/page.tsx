import CatalogSearch from "@/components/CatalogSearch";

export const metadata = { title: "Find a Book — Lang Library" };

/** Staff: search the catalog, then jump to the shelf on the map. */
export default function StaffSearchPage() {
  return (
    <div className="wrap">
      <h1>Find a book</h1>
      <p className="sub">Search every book in the library, then tap “Show me where” to see its shelf on the map.</p>
      <CatalogSearch role="staff" />
    </div>
  );
}
