import SiteHeader from "@/components/SiteHeader";
import { currentSession } from "@/lib/server";
import { withBase } from "@/lib/base";

// v8: five items, not six — Feedback lives on the home screen's quick links
// and the phone tab bar, so the header stays scannable for younger readers.
const STUDENT_LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Find a Book" },
  { href: "/games", label: "Games" },
  { href: "/map", label: "Map" },
  { href: "/me", label: "My Page" },
];

// Guests (no account) get Find a Book + the Library Map, plus an upsell.
const GUEST_LINKS = [
  { href: "/search", label: "Find a Book" },
  { href: "/map", label: "Map" },
  { href: "/api/auth/google/start", label: "Sign in with Google" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const isGuest = session?.aud === "guest";
  const links = !session ? [] : isGuest ? GUEST_LINKS : STUDENT_LINKS;

  return (
    <>
      {/* First tabbable thing on every student page — see .skip-link. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader
        tagline={isGuest ? "guest" : "student portal"}
        email={session?.email}
        audience="student"
        links={links}
      />
      <main id="main">
        {isGuest && (
          <div className="wrap" style={{ paddingTop: 12 }}>
            <div className="notice">
              You&rsquo;re browsing as a guest — Find a Book and the Library Map only.{" "}
              <a href={withBase("/api/auth/google/start")}>Sign in with your school Google account</a> for the full library.
            </div>
          </div>
        )}
        {children}
      </main>
    </>
  );
}
