import SiteHeader from "@/components/SiteHeader";
import { currentSession } from "@/lib/server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const isAdmin = session?.aud === "admin";
  const links = session
    ? [
        { href: "/", label: "Home" },
        { href: "/requests", label: "Book Requests" },
        { href: "/map", label: "Library Map" },
        { href: "/feedback", label: "Feedback" },
        ...(isAdmin ? [{ href: "/admin", label: "Management" }] : []),
      ]
    : [];
  return (
    <>
      <SiteHeader tagline="staff portal" email={session?.email} links={links} />
      {children}
    </>
  );
}
