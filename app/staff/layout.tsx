import { headers } from "next/headers";
import SiteHeader from "@/components/SiteHeader";
import LaunchRedirect from "@/components/LaunchRedirect";
import UpdateBanner from "@/components/UpdateBanner";
import { currentSession } from "@/lib/server";
import { activeBannerFor } from "@/lib/banners-store";
import { isUnifiedHost } from "@/lib/hosts";
import { portalHomeFor } from "@/lib/unified";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const isAdmin = session?.aud === "admin";
  // On the unified host "/" is the session's home — and an admin's home is
  // management, so link the portal home explicitly or admins can never get
  // back here. Dual-host mode has no /staff/<id> form: "/" is this portal.
  const banner = session ? await activeBannerFor({ audience: "staff" }) : null;
  const unified = isUnifiedHost((await headers()).get("host"));
  const home = session && unified ? portalHomeFor(session) : "/";
  const links = session
    ? [
        { href: home, label: "Home" },
        { href: "/search", label: "Find a Book" },
        { href: "/games", label: "Games" },
        { href: "/requests", label: "Requests" },
        { href: "/map", label: "Map" },
        { href: "/feedback", label: "Feedback" },
        ...(isAdmin ? [{ href: "/admin", label: "Management" }] : []),
      ]
    : [];
  return (
    <>
      {isAdmin && <LaunchRedirect />}
      {/* First tabbable thing on every staff page — see .skip-link. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* Management pages nest inside this layout, so the team sees the live
          banner on their own screens too — same strip, same dismissal. */}
      {banner && <UpdateBanner banner={banner} />}
      <SiteHeader tagline="staff portal" email={session?.email} links={links} home={home} photoUrl={session?.picture} />
      <main id="main">{children}</main>
    </>
  );
}
