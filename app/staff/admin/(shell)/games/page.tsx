import { requirePermPage } from "@/lib/server";
import GamesPanel from "@/components/GamesPanel";

export const dynamic = "force-dynamic";

/** Management: the games collection — search, add, categorize, edit, remove. */
export default async function GamesManagementPage() {
  await requirePermPage("games");
  return (
    <>
      <h1>Games</h1>
      <p className="sub">
        The games collection — its own inventory, kept separate from books. Add games, sort them into
        Card / Board / Word / Other, and edit or remove entries.
      </p>
      <GamesPanel />
    </>
  );
}
