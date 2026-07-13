"use client";

import { useEffect, useState } from "react";

const TITLES: [string, string][] = [
  ["/admin/scan", "Scan"],
  ["/admin/inventory", "Inventory"],
  ["/admin/map", "Library Map"],
  ["/admin/account", "Settings"],
  ["/admin/admins", "Admins & Invites"],
  ["/admin/requests", "Book Requests"],
  ["/admin/feedback", "Feedback"],
  ["/admin/analytics", "Site Usage"],
];

/** The colored app bar on phones: brand gradient + the current page title. */
export default function MobileHeader() {
  const [title, setTitle] = useState("Lang Library");
  useEffect(() => {
    const p = window.location.pathname;
    setTitle(TITLES.find(([href]) => p.startsWith(href))?.[1] ?? "Dashboard");
  }, []);
  return (
    <div className="mheader">
      <div>
        <small>Lang Library</small>
        {title}
      </div>
    </div>
  );
}
