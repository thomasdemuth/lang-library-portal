import { emailAllowedFor, STAFF_EMAIL_DOMAIN, STUDENT_EMAIL_DOMAIN } from "./hosts";

/**
 * Shared sign-in classifier: a verified school email → which user-facing
 * portal session. Both the Google OAuth callback and the dev email-login
 * fallback use this, so there's one source of truth for the domain rules.
 *
 * Management is deliberately NOT handled here — admins sign in on the
 * separate /admin/login password page, so a portal sign-in never elevates
 * to admin. (There used to be one exempt student-domain address that rode
 * the staff portal; with real admin accounts in place it's gone — the
 * domain decides the portal, full stop.)
 */
export type Classification =
  | { kind: "reject"; message: string }
  | { kind: "portal"; aud: "student" | "staff"; email: string };

export function classifyEmail(rawEmail: string): Classification {
  const email = rawEmail.trim().toLowerCase();
  const isStudent = emailAllowedFor("student", email);
  const isStaff = emailAllowedFor("staff", email);

  if (!isStudent && !isStaff) {
    return {
      kind: "reject",
      message: `Please use your school Google account (@${STUDENT_EMAIL_DOMAIN} for students, @${STAFF_EMAIL_DOMAIN} for staff).`,
    };
  }
  return { kind: "portal", aud: isStaff ? "staff" : "student", email };
}
