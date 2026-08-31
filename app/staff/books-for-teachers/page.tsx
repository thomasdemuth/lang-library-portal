import CatalogSearch from "@/components/CatalogSearch";

export const metadata = { title: "Books for Teachers — Lang Library" };

/**
 * The teachers-only collection: classroom sets, professional reading, answer
 * keys. These books are in the library and on the map, but they don't exist
 * as far as the student site is concerned — the API refuses this listing to a
 * student session, so the page can't be reached by guessing the URL either.
 */
export default function BooksForTeachersPage() {
  return (
    <div className="wrap">
      <h1>Books for Teachers</h1>
      <p className="sub">
        Kept out of the students&rsquo; library — they won&rsquo;t turn up in a student&rsquo;s
        search or on their home page. Search them here, then tap &ldquo;Show me where&rdquo; for
        the shelf.
      </p>
      <CatalogSearch role="staff" teachersOnly />
    </div>
  );
}
