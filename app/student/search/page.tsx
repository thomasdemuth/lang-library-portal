import CatalogSearch from "@/components/CatalogSearch";

/** Students: search the catalog, then jump to the shelf on the map. */
export default function StudentSearchPage() {
  return (
    <div className="wrap">
      <h1>Find a book</h1>
      <p className="sub">Search every book in the library, then tap “Where is it?” to see its shelf on the map.</p>
      <CatalogSearch />
    </div>
  );
}
