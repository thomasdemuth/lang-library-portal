import GamesBrowser from "@/components/GamesBrowser";

/** Staff: browse the games collection by sub-category. */
export default function StaffGamesPage() {
  return (
    <div className="wrap">
      <h1>Games</h1>
      <p className="sub">Card, board, and word games in the collection — tap one to see details and its spot on the map.</p>
      <GamesBrowser />
    </div>
  );
}
