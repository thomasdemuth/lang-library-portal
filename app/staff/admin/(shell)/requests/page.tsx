import AdminRequestsPanel from "@/components/AdminRequestsPanel";
import { requirePermPage } from "@/lib/server";

export default async function AdminRequestsPage() {
  const admin = await requirePermPage("requests");
  return (
    <>
      <h1>Book Requests</h1>
      <p className="sub">
        Teacher requests, matched against the live inventory. Anything untouched for 72 hours gets a
        reminder.
      </p>
      <AdminRequestsPanel canDelete={admin.role === "chief"} />
    </>
  );
}
