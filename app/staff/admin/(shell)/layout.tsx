import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <div className="admin-grid">
      <aside className="side">
        <span className="side-label">Library</span>
        <a href="/admin">Dashboard</a>
        <a href="/admin/requests">Book Requests</a>
        <a href="/admin/feedback">Feedback</a>
        <a href="/admin/inventory">Inventory</a>
        <a href="/admin/map">Map Editor</a>
        <span className="side-label">Tools</span>
        <a href="/admin/sign-maker">Sign Maker</a>
        <a href="/admin/analytics">Site Usage</a>
        <span className="side-label">Account</span>
        <a href="/admin/admins">Admins &amp; Invites</a>
        <a href="/admin/account">My Account</a>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
