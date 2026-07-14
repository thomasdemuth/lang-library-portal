import UserInsightsPanel from "@/components/UserInsightsPanel";
import { requirePermPage } from "@/lib/server";
import { studentUrl } from "@/lib/hosts";

export default async function UsersPage() {
  await requirePermPage("users");
  return (
    <>
      <h1>User Insights</h1>
      <p className="sub">
        Every student and teacher account: activity, reading, requests, and internal notes.
        Notes are visible to admins only.
      </p>
      <UserInsightsPanel studentBase={studentUrl()} />
    </>
  );
}
