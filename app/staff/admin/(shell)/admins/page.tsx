import { currentAdmin } from "@/lib/server";
import AdminsPanel from "@/components/AdminsPanel";

export default async function AdminsPage() {
  const admin = await currentAdmin();
  return (
    <>
      <h1>Admins &amp; Invites</h1>
      <p className="sub">Manage management accounts and private invite links.</p>
      <AdminsPanel selfId={admin!.id} />
    </>
  );
}
