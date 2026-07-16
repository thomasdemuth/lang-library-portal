import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { Ic } from "@/components/icons";
import DashboardCards, { type DashKpi, type DashWidget } from "@/components/DashboardCards";

export const dynamic = "force-dynamic";

async function counts() {
  const client = db();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [requests, feedback, active, reads, favs] = await Promise.all([
    client.from("book_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    client.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    client
      .from("inventory_syncs")
      .select("id, activated_at, merged_count")
      .eq("status", "active")
      .maybeSingle(),
    client.from("reading_log").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    client.from("favorites").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
  ]);
  return {
    newRequests: requests.count ?? 0,
    newFeedback: feedback.count ?? 0,
    books: active.data?.merged_count ?? 0,
    lastSync: active.data?.activated_at ?? null,
    readsWeek: reads.count ?? 0,
    favsWeek: favs.count ?? 0,
  };
}

export default async function AdminDashboard() {
  const admin = await currentAdmin();
  let stats = {
    newRequests: 0,
    newFeedback: 0,
    books: 0,
    lastSync: null as string | null,
    readsWeek: 0,
    favsWeek: 0,
  };
  try {
    stats = await counts();
  } catch {
    /* dashboard should render even if the DB hiccups */
  }

  const isChief = admin?.role === "chief";
  const can = (k: Parameters<typeof canDo>[1]) => (admin ? canDo(admin, k) : false);

  // Every stat this admin could put in the top row (the picker's catalog)
  const kpis: (DashKpi & { show: boolean })[] = [
    { id: "requests", show: can("requests"), value: String(stats.newRequests), label: "new book requests" },
    { id: "feedback", show: can("feedback_view"), value: String(stats.newFeedback), label: "unread feedback" },
    { id: "books", show: can("inventory_view"), value: stats.books.toLocaleString(), label: "titles in inventory" },
    {
      id: "sync",
      show: can("inventory_view"),
      value: stats.lastSync ? new Date(stats.lastSync).toLocaleDateString() : "never",
      label: "last catalog update",
    },
    { id: "reads", show: can("users"), value: String(stats.readsWeek), label: "books read this week" },
    { id: "favs", show: can("users"), value: String(stats.favsWeek), label: "favorites this week" },
  ];

  const widgets: (DashWidget & { show: boolean })[] = [
    { id: "requests", show: can("requests"), href: "/admin/requests", icon: "requests", badge: stats.newRequests, title: "Book Requests", desc: "Review teacher requests and set their status." },
    { id: "feedback", show: can("feedback_view"), href: "/admin/feedback", icon: "feedback", badge: stats.newFeedback, title: "Feedback", desc: "What students and teachers are telling you." },
    { id: "inventory", show: can("inventory_view") || can("inventory_import"), href: "/admin/inventory", icon: "book", badge: 0, title: "Inventory", desc: "Scan, tag, and search the catalog." },
    { id: "map", show: can("map_edit") || can("map_floorplan"), href: "/admin/map", icon: "map", badge: 0, title: "Map Editor", desc: "Place shelves, set categories, keep internal notes." },
    { id: "signmaker", show: can("signmaker"), href: "/admin/sign-maker", icon: "sign", badge: 0, title: "Sign Maker", desc: "Print shelf tabs, banners, and wayfinding signs." },
    { id: "analytics", show: can("analytics"), href: "/admin/analytics", icon: "chart", badge: 0, title: "Site Usage", desc: "Visits and activity across both sites." },
    { id: "users", show: can("users"), href: "/admin/users", icon: "users", badge: 0, title: "User Insights", desc: "Student & teacher accounts, activity, and notes." },
    { id: "admins", show: isChief, href: "/admin/admins", icon: "users", badge: 0, title: "Admins & Invites", desc: "Add admins, set their powers, and manage invites." },
  ];

  const availableKpis = kpis.filter((k) => k.show).map(({ show: _s, ...k }) => k);
  const availableWidgets = widgets.filter((w) => w.show).map(({ show: _s, ...w }) => w);

  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date())
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <h1>
        {greeting}, {admin?.name?.split(" ")[0] ?? "librarian"}{" "}
        <span className="wave" aria-hidden><Ic name="sparkle" size={20} /></span>
      </h1>
      <p className="sub">
        Here&rsquo;s the library at a glance.{" "}
        <span className="pill" style={{ background: isChief ? "#eef1fb" : "#eef0f5", marginLeft: 4 }}>
          {isChief ? "Chief Admin" : "Admin"}
        </span>
      </p>

      {availableWidgets.length > 0 || availableKpis.length > 0 ? (
        <DashboardCards
          kpis={availableKpis}
          widgets={availableWidgets}
          defaultStats={["requests", "feedback", "books", "sync"]}
        />
      ) : (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            You don&rsquo;t have any powers assigned yet. A Chief Admin can grant them from
            <b> Admins &amp; Invites</b>.
          </p>
        </div>
      )}
    </>
  );
}
