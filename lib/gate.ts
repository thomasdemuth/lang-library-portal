import {
  emailAllowedFor,
  isManagementExemptEmail,
  STAFF_EMAIL_DOMAIN,
  STUDENT_EMAIL_DOMAIN,
} from "./hosts";

/**
 * Shared sign-in classifier: a verified school email → which user-facing
 * portal session. Both the Google OAuth callback and the dev email-login
 * fallback use this, so there's one source of truth for the domain rules.
 *
 * Management is deliberately NOT handled here — admins sign in on the
 * separate /admin/login password page, so a portal sign-in never elevates to
 * admin. (The one exempt student-domain account rides the staff portal and
 * still manages via /admin/login.)
 */
export type Classification =
  | { kind: "reject"; message: string }
  | { kind: "portal"; aud: "student" | "staff"; email: string };

export function classifyEmail(rawEmail: string): Classification {
  const email = rawEmail.trim().toLowerCase();
  const isStudent = emailAllowedFor("student", email);
  const isStaff = emailAllowedFor("staff", email);
  const exempt = isManagementExemptEmail(email);

  if (!isStudent && !isStaff && !exempt) {
    return {
      kind: "reject",
      message: `Please use your school Google account (@${STUDENT_EMAIL_DOMAIN} for students, @${STAFF_EMAIL_DOMAIN} for staff).`,
    };
  }
  // Staff-domain emails and the exempt librarian account land in the staff
  // portal; plain student-domain emails land in the student portal.
  const aud: "student" | "staff" = isStaff || exempt ? "staff" : "student";
  return { kind: "portal", aud, email };
}
