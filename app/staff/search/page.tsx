import CatalogSearch from "@/components/CatalogSearch";

export const metadata = { title: "Find a Book — Lang Library" };

/** Staff: search the catalog, then jump to the shelf on the map. */
export default function StaffSearchPage() {
  return (
    <div className="wrap">
      {/* v8: the search bar says it all — see the student search page. */}
      <h1 className="sr-only">Find a book</h1>
      <CatalogSearch role="staff" />
    </div>
  );
}
