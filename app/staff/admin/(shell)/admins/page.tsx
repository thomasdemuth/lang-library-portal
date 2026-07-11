import { requireChiefPage } from "@/lib/server";
import AdminsPanel from "@/components/AdminsPanel";

export default async function AdminsPage() {
  const admin = await requireChiefPage();
  return (
    <>
      <h1>Admins &amp; Invites</h1>
      <p className="sub">Add admins, choose each one&rsquo;s powers, and manage invite links.</p>
      <AdminsPanel selfId={admin.id} />
    </>
  );
}
