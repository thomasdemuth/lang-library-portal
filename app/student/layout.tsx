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
                { href: "/map", label: "Library Map" },
                { href: "/feedback", label: "Feedback" },
              ]
            : []
        }
      />
      {children}
    </>
  );
}
