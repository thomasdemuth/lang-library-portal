import UserMenu from "@/components/UserMenu";

export default function SiteHeader({
  tagline,
  links,
  email,
  audience = "staff",
  home = "/",
}: {
  tagline: string;
  links: { href: string; label: string }[];
  email?: string | null;
  audience?: "student" | "staff";
  /** Where the wordmark goes — this portal's home, not always "/" (see StaffLayout). */
  home?: string;
}) {
  return (
    <header className="topbar">
      <a className="brand" href={home}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/icon-192.png" alt="" width={38} height={38} />
        <span className="brand-tag">{tagline}</span>
      </a>
      <nav className="nav">
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="whoami">{email && <UserMenu email={email} audience={audience} />}</div>
    </header>
  );
}
