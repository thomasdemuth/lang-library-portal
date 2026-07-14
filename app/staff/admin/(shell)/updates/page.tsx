import { requireAdminPage } from "@/lib/server";
import { canPublishUpdates } from "@/lib/updates";
import UpdatesPanel from "@/components/UpdatesPanel";

export const dynamic = "force-dynamic";

/** App changelog; the developer can publish and push-notify from here. */
export default async function UpdatesPage() {
  const admin = await requireAdminPage();
  return (
    <>
      <h1>Updates</h1>
      <p className="sub">What's new in the library portal.</p>
      <UpdatesPanel canPublish={canPublishUpdates(admin.email)} />
    </>
  );
}
