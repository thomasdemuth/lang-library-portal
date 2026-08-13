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
      {/* v8: the search bar says it all — no stacked title + description above
          it. The heading stays for screen readers and the page outline. */}
      <h1 className="sr-only">Find a book</h1>
      <CatalogSearch role={session?.aud === "guest" ? "guest" : "student"} />
    </div>
  );
}
