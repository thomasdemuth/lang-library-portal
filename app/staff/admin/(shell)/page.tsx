import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { Ic } from "@/components/icons";

export const dynamic = "force-dynamic";

async function counts() {
  const client = db();
  const [requests, feedback, active] = await Promise.all([
    client.from("book_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    client.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    client
      .from("inventory_syncs")
      .select("id, activated_at, merged_count")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  return {
    newRequests: requests.count ?? 0,
    newFeedback: feedback.count ?? 0,
    books: active.data?.merged_count ?? 0,
    lastSync: active.data?.activated_at ?? null,
  };
}

export default async function AdminDashboard() {
  const admin = await currentAdmin();
  let stats = { newRequests: 0, newFeedback: 0, books: 0, lastSync: null as string | null };
  try {
    stats = await counts();
  } catch {
    /* dashboard should render even if the DB hiccups */
  }

  const isChief = admin?.role === "chief";
  const can = (k: Parameters<typeof canDo>[1]) => (admin ? canDo(admin, k) : false);

  const kpis = [
    { show: can("requests"), b: String(stats.newRequests), label: "new book requests" },
    { show: can("feedback_view"), b: String(stats.newFeedback), label: "unread feedback" },
    { show: can("inventory_view"), b: stats.books.toLocaleString(), label: "titles in inventory" },
    {
      show: can("inventory_view"),
      b: stats.lastSync ? new Date(stats.lastSync).toLocaleDateString() : "never",
      label: "last Libib sync",
    },
  ].filter((k) => k.show);

  const cards = [
    { show: can("requests"), href: "/admin/requests", icon: "requests", badge: stats.newRequests, h: "Book Requests", p: "Review teacher requests and set their status." },
    { show: can("feedback_view"), href: "/admin/feedback", icon: "feedback", badge: stats.newFeedback, h: "Feedback", p: "What students and teachers are telling you." },
    { show: can("inventory_view") || can("inventory_import"), href: "/admin/inventory", icon: "book", badge: 0, h: "Inventory", p: "Scan, tag, and search the catalog; sync from Libib." },
    { show: can("map_edit") || can("map_floorplan"), href: "/admin/map", icon: "map", badge: 0, h: "Map Editor", p: "Place shelves, set categories, keep internal notes." },
    { show: can("signmaker"), href: "/admin/sign-maker", icon: "sign", badge: 0, h: "Sign Maker", p: "Print shelf tabs, banners, and wayfinding signs." },
    { show: can("analytics"), href: "/admin/analytics", icon: "chart", badge: 0, h: "Site Usage", p: "Visits and activity across both sites." },
    { show: isChief, href: "/admin/admins", icon: "users", badge: 0, h: "Admins & Invites", p: "Add admins, set their powers, and manage invites." },
  ].filter((c) => c.show);

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

      {kpis.length > 0 && (
        <div className="kpis" style={{ marginBottom: 22 }}>
          {kpis.map((k, i) => (
            <div className="kpi" key={i}>
              <b>{k.b}</b>
              <span>{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {cards.length > 0 ? (
        <div className="cards">
          {cards.map((c) => (
            <a className="card navcard" href={c.href} key={c.href}>
              <h2>
                <span className="navcard-icon">
                  <Ic name={c.icon} size={17} />
                </span>
                {c.h}
                {c.badge > 0 && <span className="navcard-badge">{c.badge}</span>}
                <span className="navcard-arrow" aria-hidden>→</span>
              </h2>
              <p>{c.p}</p>
            </a>
          ))}
        </div>
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
