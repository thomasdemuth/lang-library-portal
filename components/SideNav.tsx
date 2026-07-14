"use client";

import { useEffect, useState } from "react";
import { Ic } from "@/components/icons";

export type SideLink = { href: string; label: string; icon: string };

/**
 * The desktop admin sidebar: icons, sections, and a live active state.
 * It can collapse to an icon rail (persisted per device); hovering the
 * rail temporarily expands it over the content. The collapsed flag lives
 * on <html data-sidenav> — stamped pre-paint by the root layout script —
 * so the rail renders collapsed with no flash.
 */
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setPath(window.location.pathname);
    setCollapsed(document.documentElement.dataset.sidenav === "collapsed");
  }, []);

  function toggle() {
    setCollapsed((cur) => {
      const next = !cur;
      try {
        localStorage.setItem("ll-sidenav", next ? "collapsed" : "open");
      } catch {}
      if (next) document.documentElement.dataset.sidenav = "collapsed";
      else delete document.documentElement.dataset.sidenav;
      return next;
    });
  }

  const item = (l: SideLink) => {
    const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
    return (
      <a key={l.href} href={l.href} className={active ? "active" : undefined} title={l.label}>
        <span className="side-ico">
          <Ic name={l.icon} size={17} />
        </span>
        <span className="side-text">{l.label}</span>
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
      <button
        type="button"
        className="side-collapse"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span className="side-ico">
          <Ic name={collapsed ? "expand" : "collapse"} size={17} />
        </span>
        <span className="side-text">Collapse</span>
      </button>
    </aside>
  );
}
