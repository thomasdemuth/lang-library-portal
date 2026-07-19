/**
 * Sanitize a `?next=` redirect target. Only same-site absolute paths are
 * allowed: a single leading slash NOT followed by another slash or a
 * backslash. This rejects protocol-relative URLs like "//evil.example" and
 * "/\evil.example" (which browsers treat as off-site), so a crafted login
 * link can't bounce the user to another origin after sign-in.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (next[0] !== "/" || next[1] === "/" || next[1] === "\\") return fallback;
  return next;
}
