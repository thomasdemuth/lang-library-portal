import { currentAdmin } from "@/lib/server";

export default async function AdminDashboard() {
  const admin = await currentAdmin();
  return (
    <>
      <h1>Management dashboard</h1>
      <p className="sub">Welcome back, {admin?.name?.split(" ")[0] ?? "librarian"}.</p>
      <div className="cards">
        <a className="card" href="/admin/requests">
          <h2>Book Requests</h2>
          <p>Review teacher requests and set their status.</p>
        </a>
        <a className="card" href="/admin/inventory">
          <h2>Inventory</h2>
          <p>Upload the latest Libib export and search the catalog.</p>
        </a>
        <a className="card" href="/admin/map">
          <h2>Map Editor</h2>
          <p>Place shelves, set categories, keep internal notes.</p>
        </a>
        <a className="card" href="/admin/feedback">
          <h2>Feedback</h2>
          <p>What students and teachers are telling you.</p>
        </a>
        <a className="card" href="/admin/sign-maker">
          <h2>Sign Maker</h2>
          <p>Print shelf tabs, banners, and wayfinding signs.</p>
        </a>
        <a className="card" href="/admin/analytics">
          <h2>Site Usage</h2>
          <p>Visits and activity across the student and staff sites.</p>
        </a>
      </div>
    </>
  );
}
