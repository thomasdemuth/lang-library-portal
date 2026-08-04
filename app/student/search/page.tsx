import CatalogSearch from "@/components/CatalogSearch";
import { currentSession } from "@/lib/server";

export const metadata = { title: "Find a Book — Lang Library" };

/** Students: search the catalog, then light the shelf up on the map.
 *  The wide wrap gives the ≥900px split view (results beside the mini-map)
 *  room to breathe; on phones everything stacks back to one column. */
export default async function StudentSearchPage() {
  const session = await currentSession();
  return (
    <div className="wrap" style={{ maxWidth: 1280 }}>
      <h1>Find a book</h1>
      <p className="sub">Search every book in the library, then tap “Show me where” to see its shelf on the map.</p>
      <CatalogSearch role={session?.aud === "guest" ? "guest" : "student"} />
    </div>
  );
}
