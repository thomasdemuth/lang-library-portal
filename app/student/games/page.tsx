import GamesBrowser from "@/components/GamesBrowser";

/** Students: browse the games collection by sub-category. */
export default function StudentGamesPage() {
  return (
    <div className="wrap student-theme">
      <h1>Games</h1>
      <p className="sub">Card, board, and word games you can borrow — tap one to see what it is and where to find it.</p>
      <GamesBrowser />
    </div>
  );
}
