/**
 * Time-of-day greeting for the student home hero. Pure and local-time based,
 * so it's testable and so a kiosk that renders at 11:59 says the right thing.
 *
 * The caller computes this on the CLIENT (in an effect) and falls back to the
 * plain "Hi" on the server render — the server's clock is UTC and would
 * otherwise hand a hydration mismatch to every student west of Greenwich.
 */
export type Greeting = "Good morning" | "Good afternoon" | "Good evening";

export function greeting(now: Date): Greeting {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
