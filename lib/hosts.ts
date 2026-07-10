/**
 * Host → audience mapping. Everything is env-driven so the app can launch on
 * two *.vercel.app URLs and swap to real school subdomains later with no code
 * changes (STUDENT_HOST / STAFF_HOST).
 */
export const STUDENT_EMAIL_DOMAIN = "students.thelangschool.org";
export const STAFF_EMAIL_DOMAIN = "thelangschool.org";

export type HostAudience = "student" | "staff";

export function studentHost(): string {
  return process.env.STUDENT_HOST ?? "student.localhost:4173";
}

export function staffHost(): string {
  return process.env.STAFF_HOST ?? "staff.localhost:4173";
}

export function audienceForHost(host: string | null): HostAudience | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (h === studentHost().toLowerCase()) return "student";
  if (h === staffHost().toLowerCase()) return "staff";
  return null;
}

function proto(host: string): "http" | "https" {
  return host.includes("localhost") ? "http" : "https";
}

export function studentUrl(): string {
  const h = studentHost();
  return `${proto(h)}://${h}`;
}

export function staffUrl(): string {
  const h = staffHost();
  return `${proto(h)}://${h}`;
}

/** Email domain rules per host-audience. */
export function emailAllowedFor(audience: HostAudience, email: string): boolean {
  const e = email.toLowerCase();
  if (audience === "student") return e.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
  // Staff host: staff domain only — and never the student subdomain of it.
  return e.endsWith(`@${STAFF_EMAIL_DOMAIN}`) && !e.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}
