import AdminRequestsPanel from "@/components/AdminRequestsPanel";

export default function AdminRequestsPage() {
  return (
    <>
      <h1>Book Requests</h1>
      <p className="sub">
        Teacher requests, matched against the live inventory. New requests email the team; anything
        untouched for 72 hours gets a reminder.
      </p>
      <AdminRequestsPanel />
    </>
  );
}
