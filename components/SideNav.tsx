"use client";

import { useEffect, useState } from "react";
import { Ic } from "@/components/icons";

export type SideLink = { href: string; label: string; icon: string };

/** The desktop admin sidebar: icons, sections, and a live active state. */
export default function SideNav({
  library,
  tools,
  account,
}: {
  library: SideLink[];
  tools: SideLink[];
  account: SideLink[];
}) {
  const [path, setPath] = useState("");
  useEffect(() => setPath(window.location.pathname), []);

  const item = (l: SideLink) => {
    const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
    return (
      <a key={l.href} href={l.href} className={active ? "active" : undefined}>
        <Ic name={l.icon} size={17} />
        {l.label}
      </a>
    );
  };

  return (
    <aside className="side">
      <span className="side-label">Library</span>
      {library.map(item)}
      {tools.length > 0 && <span className="side-label">Tools</span>}
      {tools.map(item)}
      <span className="side-label">Account</span>
      {account.map(item)}
    </aside>
  );
}
