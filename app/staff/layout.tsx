import SiteHeader from "@/components/SiteHeader";
import LaunchRedirect from "@/components/LaunchRedirect";
import { currentSession } from "@/lib/server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const isAdmin = session?.aud === "admin";
  const links = session
    ? [
        { href: "/", label: "Home" },
        { href: "/search", label: "Find a Book" },
        { href: "/requests", label: "Book Requests" },
        { href: "/map", label: "Library Map" },
        { href: "/feedback", label: "Feedback" },
        ...(isAdmin ? [{ href: "/admin", label: "Management" }] : []),
      ]
    : [];
  return (
    <>
      {isAdmin && <LaunchRedirect />}
      <SiteHeader tagline="staff portal" email={session?.email} links={links} />
      {children}
    </>
  );
}
