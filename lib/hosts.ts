/**
 * Host → audience mapping. Everything is env-driven so the app can launch on
 * two *.vercel.app URLs and swap to real school subdomains later with no code
 * changes (STUDENT_HOST / STAFF_HOST).
 */
export const STUDENT_EMAIL_DOMAIN = "students.thelangschool.org";
export const STAFF_EMAIL_DOMAIN = "thelangschool.org";

export type HostAudience = "student" | "staff";

/**
 * Single-subdomain mode (library.thelangschool.org): when UNIFIED_HOST is
 * set and the request arrives on it, the middleware routes by path + session
 * instead of by host. The dual-host mode keeps working alongside it, so a
 * deployment can serve the old *.vercel.app hosts and the school subdomain
 * at the same time during a transition.
 */
export function unifiedHost(): string | null {
  return process.env.UNIFIED_HOST || null;
}

export function isUnifiedHost(host: string | null): boolean {
  const u = unifiedHost();
  return Boolean(u && host && host.toLowerCase() === u.toLowerCase());
}

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
  const h = unifiedHost() ?? studentHost();
  return `${proto(h)}://${h}`;
}

export function staffUrl(): string {
  const h = unifiedHost() ?? staffHost();
  return `${proto(h)}://${h}`;
}

/**
 * Student-domain emails specifically exempted to ALSO sign in as management
 * (they must still be a registered admin account and enter its password).
 * This is the personal account the librarian-developer uses on the student
 * domain — a normal student email never reaches the password path.
 */
const MANAGEMENT_EXEMPT_EMAILS = new Set(["thomas.demuth@students.thelangschool.org"]);

export function isManagementExemptEmail(email: string): boolean {
  return MANAGEMENT_EXEMPT_EMAILS.has(email.trim().toLowerCase());
}

/** Email domain rules per host-audience. */
export function emailAllowedFor(audience: HostAudience, email: string): boolean {
  const e = email.toLowerCase();
  if (audience === "student") return e.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
  // Staff host: staff domain only — and never the student subdomain of it.
  return e.endsWith(`@${STAFF_EMAIL_DOMAIN}`) && !e.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}
