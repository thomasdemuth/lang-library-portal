"use client";

import { useEffect, useState } from "react";
import { stripBase } from "@/lib/base";

const TITLES: [string, string][] = [
  ["/admin/scan", "Scan"],
  ["/admin/inventory", "Inventory"],
  ["/admin/games", "Games"],
  ["/admin/map", "Library Map"],
  ["/admin/account", "Settings"],
  ["/admin/admins", "Admins & Invites"],
  ["/admin/requests", "Book Requests"],
  ["/admin/feedback", "Feedback"],
  ["/admin/analytics", "Site Usage"],
  ["/admin/updates", "Updates"],
  ["/admin/banners", "Site Banner"],
];

/** The colored app bar on phones: brand gradient + the current page title. */
export default function MobileHeader() {
  const [title, setTitle] = useState("Lang Library");
  useEffect(() => {
    const p = stripBase(window.location.pathname);
    setTitle(TITLES.find(([href]) => p.startsWith(href))?.[1] ?? "Dashboard");
  }, []);
  // An <h1>, not a <div>: on phones this bar IS the page's title. No reset
  // needed — .mheader already sets display, font-size, font-weight and
  // margin, which is every UA <h1> default, so the bar renders identically
  // (and above 640px .mheader is display:none, so the h1 never shows there).
  return <h1 className="mheader">{title}</h1>;
}
