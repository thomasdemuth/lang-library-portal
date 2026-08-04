/**
 * Student portal helpers: display names derived from school emails. The
 * reading game (stars, shop, avatar studio) was removed — reading is a
 * personal log now, and avatars are Google profile photos (or an initial).
 * The legacy `student_profiles.avatar` jsonb column stays in the DB, dormant
 * and unread.
 */

/** "jane.doe@students…" → "Jane D." */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  const [first, last] = local.split(/[._-]/);
  const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  return last ? `${cap(first)} ${cap(last)[0]}.` : cap(first);
}

/** "thomas.demuth@…" → "Thomas Demuth" (school emails are first.last). */
export function displayNameFull(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  return local.split(/[._-]/).filter(Boolean).map(cap).join(" ") || email;
}
