"use client";

import { useEffect, useState } from "react";
import UserMenu from "@/components/UserMenu";

/**
 * Which nav link is the page you're on?
 *
 * Paths reach the browser in two shapes — the short form (/search) and the
 * canonical portal form (/student/<id>/search) — and middleware rewrites
 * between them, so the portal prefix is stripped off both sides before
 * comparing. A section link stays current for everything beneath it, which
 * is what keeps "Management" lit across /admin/*.
 */
export function isCurrentLink(href: string, path: string): boolean {
  if (!path) return false;
  const strip = (p: string) => p.replace(/^\/(student|staff)\/[^/]+/, "") || "/";
  const h = strip(href);
  const p = strip(path);
  if (h === "/") return p === "/";
  return p === h || p.startsWith(`${h}/`);
}

export default function SiteHeader({
  tagline,
  links,
  email,
  audience = "staff",
  home = "/",
  photoUrl,
}: {
  tagline: string;
  links: { href: string; label: string }[];
  email?: string | null;
  audience?: "student" | "staff";
  /** Where the wordmark goes — this portal's home, not always "/" (see StaffLayout). */
  home?: string;
  /** Google profile photo for the chip — staff only (students fetch their own). */
  photoUrl?: string | null;
}) {
  // Read the real browser URL after mount, the same way MobileTabBar does:
  // middleware rewrites mean the server-rendered path is the *internal* one,
  // so usePathname() would disagree with the address bar and mismatch on
  // hydration. Nothing is marked current until this lands — one frame later.
  const [path, setPath] = useState("");
  useEffect(() => setPath(window.location.pathname), []);

  return (
    <header className="topbar">
      <a className="brand" href={home}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/icon-192.png" alt="" width={38} height={38} />
        <span className="brand-tag">{tagline}</span>
      </a>
      <nav className="nav" aria-label="Main">
        {links.map((l) => {
          const current = isCurrentLink(l.href, path);
          return (
            <a
              key={l.href}
              href={l.href}
              className={current ? "active" : undefined}
              aria-current={current ? "page" : undefined}
            >
              {l.label}
            </a>
          );
        })}
      </nav>
      <div className="whoami">{email && <UserMenu email={email} audience={audience} photoUrl={photoUrl} />}</div>
    </header>
  );
}
