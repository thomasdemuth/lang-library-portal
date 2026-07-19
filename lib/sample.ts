/**
 * Pick up to `count` distinct random ids in the inclusive range [lo, hi].
 * The target is capped at the range size, so a small range (fewer than
 * `count` ids available) returns every id instead of looping forever
 * trying to collect distinct values that don't exist.
 */
export function sampleIds(lo: number, hi: number, count: number): number[] {
  const span = hi - lo + 1;
  if (span <= 0 || count <= 0) return [];
  const target = Math.min(count, span);
  const ids = new Set<number>();
  while (ids.size < target) ids.add(lo + Math.floor(Math.random() * span));
  return [...ids];
}
