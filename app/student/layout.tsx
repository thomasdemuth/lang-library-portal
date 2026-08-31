import Celebrations from "@/components/Celebrations";
import SiteHeader from "@/components/SiteHeader";
import UpdateBanner from "@/components/UpdateBanner";
import { currentSession } from "@/lib/server";
import { activeBannerFor } from "@/lib/banners-store";
import { withBase } from "@/lib/base";

// v8 kept this to five items for scannability; Take a Book Home earns the
// sixth slot — self-checkout is the one thing a kid at the shelf needs fast.
// (Feedback still lives on the home screen's quick links and the phone bar.)
const STUDENT_LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Find a Book" },
  { href: "/take-home", label: "Take a Book Home" },
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
  const banner = session ? await activeBannerFor({ audience: "student", isGuest }) : null;

  return (
    <>
      {/* First tabbable thing on every student page — see .skip-link. It stays
          ahead of the banner, so "Skip to content" is still the first stop. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* Badge pop-ups and the first-visit welcome, for signed-in students
          only. Mounted here so a badge earned anywhere — including the
          take-home kiosk — celebrates on the page the student is on. */}
      {session && !isGuest && <Celebrations email={session.email} />}
      {banner && <UpdateBanner banner={banner} />}
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
