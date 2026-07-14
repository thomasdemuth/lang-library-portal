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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/icon-192.png" alt="" width={30} height={30} />
        <b>
          <span className="lang">Lang</span> <span className="lib">Library</span>
        </b>
        <span className="brand-tag">{tagline}</span>
      </a>
      <nav className="nav">
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="whoami">
        {email && (
          <span className="avatar-chip" title={email}>
            <span className="avatar">{email[0]?.toUpperCase()}</span>
            <span className="avatar-email">{email}</span>
          </span>
        )}
      </div>
    </header>
  );
}
