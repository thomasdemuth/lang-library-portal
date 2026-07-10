import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/server";

export const dynamic = "force-dynamic";

async function counts() {
  const client = db();
  const [requests, feedback, active, cronBeat] = await Promise.all([
    client.from("book_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    client.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    client
      .from("inventory_syncs")
      .select("id, activated_at, merged_count")
      .eq("status", "active")
      .maybeSingle(),
    client
      .from("book_requests")
      .select("reminder_sent_at")
      .not("reminder_sent_at", "is", null)
      .order("reminder_sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    newRequests: requests.count ?? 0,
    newFeedback: feedback.count ?? 0,
    books: active.data?.merged_count ?? 0,
    lastSync: active.data?.activated_at ?? null,
    lastReminder: cronBeat.data?.reminder_sent_at ?? null,
  };
}

export default async function AdminDashboard() {
  const admin = await currentAdmin();
  let stats = { newRequests: 0, newFeedback: 0, books: 0, lastSync: null as string | null, lastReminder: null as string | null };
  try {
    stats = await counts();
  } catch {
    /* dashboard should render even if the DB hiccups */
  }

  return (
    <>
      <h1>Management dashboard</h1>
      <p className="sub">Welcome back, {admin?.name?.split(" ")[0] ?? "librarian"}.</p>

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi">
          <b>{stats.newRequests}</b>
          <span>new book requests</span>
        </div>
        <div className="kpi">
          <b>{stats.newFeedback}</b>
          <span>unread feedback</span>
        </div>
        <div className="kpi">
          <b>{stats.books.toLocaleString()}</b>
          <span>titles in inventory</span>
        </div>
        <div className="kpi">
          <b>{stats.lastSync ? new Date(stats.lastSync).toLocaleDateString() : "never"}</b>
          <span>last Libib sync</span>
        </div>
      </div>

      <div className="cards">
        <a className="card" href="/admin/requests">
          <h2>Book Requests{stats.newRequests > 0 ? ` (${stats.newRequests})` : ""}</h2>
          <p>Review teacher requests and set their status.</p>
        </a>
        <a className="card" href="/admin/feedback">
          <h2>Feedback{stats.newFeedback > 0 ? ` (${stats.newFeedback})` : ""}</h2>
          <p>What students and teachers are telling you.</p>
        </a>
        <a className="card" href="/admin/inventory">
          <h2>Inventory</h2>
          <p>Upload the latest Libib export and search the catalog.</p>
        </a>
        <a className="card" href="/admin/map">
          <h2>Map Editor</h2>
          <p>Place shelves, set categories, keep internal notes.</p>
        </a>
        <a className="card" href="/admin/sign-maker">
          <h2>Sign Maker</h2>
          <p>Print shelf tabs, banners, and wayfinding signs.</p>
        </a>
        <a className="card" href="/admin/analytics">
          <h2>Site Usage</h2>
          <p>Visits and activity across both sites.</p>
        </a>
      </div>
    </>
  );
}
