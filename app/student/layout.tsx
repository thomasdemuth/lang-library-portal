import SiteHeader from "@/components/SiteHeader";
import { currentSession } from "@/lib/server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  return (
    <>
      <SiteHeader
        tagline="student portal"
        email={session?.email}
        links={
          session
            ? [
                { href: "/", label: "Home" },
                { href: "/search", label: "Find a Book" },
                { href: "/map", label: "Library Map" },
                { href: "/me", label: "My Page" },
                { href: "/feedback", label: "Feedback" },
              ]
            : []
        }
      />
      {children}
    </>
  );
}
