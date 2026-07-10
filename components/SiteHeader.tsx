import SignOutButton from "@/components/SignOutButton";

export default function SiteHeader({
  tagline,
  links,
  email,
}: {
  tagline: string;
  links: { href: string; label: string }[];
  email?: string | null;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="/">
        <b>Lang Library</b>
        <span>{tagline}</span>
      </a>
      <nav className="nav">
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="whoami">
        {email && <span>{email}</span>}
        {email && <SignOutButton />}
      </div>
    </header>
  );
}
