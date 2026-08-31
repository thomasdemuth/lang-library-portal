/**
 * The warm line that lands when a student logs a book.
 *
 * The old copy was one fixed string ("Added to your reading log"), which is
 * the same the 1st time and the 40th. These lines vary, and every one of them
 * names the running total — so the toast itself is the progress bar.
 *
 * Every branch is positive. There is deliberately no path that produces a
 * scolding, a comparison, or a reference to a missed day; `lib/praise.test.ts`
 * asserts that over the whole range.
 */

/** The rotating pool for an ordinary log — nothing milestone-y about it. */
const CHEERS = ["Nice one.", "Another one down.", "Good pick.", "Onto the next.", "Love that."] as const;

const books = (n: number) => `${n} book${n === 1 ? "" : "s"}`;

/**
 * `rand` is injectable so tests are deterministic; callers pass nothing.
 * `totalThisYear` is the count INCLUDING the book just logged.
 */
export function praiseForRead(totalThisYear: number, rand: () => number = Math.random): string {
  const n = Math.max(1, Math.floor(totalThisYear) || 1);
  if (n === 1) return "Your reading log has begun!";
  if (n % 10 === 0) return `Ten more! That's ${books(n)} this year.`;
  const cheer = CHEERS[Math.min(CHEERS.length - 1, Math.floor(rand() * CHEERS.length))];
  return `${cheer} That's ${books(n)} this year.`;
}

/** The line under the kiosk's success card: "That's your 3rd book home!" */
export function praiseForTakeHome(totalEver: number): string {
  const n = Math.max(1, Math.floor(totalEver) || 1);
  return `That's your ${ordinal(n)} book home!`;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th"}`;
}
