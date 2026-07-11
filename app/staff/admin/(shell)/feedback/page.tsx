import AdminFeedbackPanel from "@/components/AdminFeedbackPanel";
import { requirePermPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";

export default async function AdminFeedbackPage() {
  const admin = await requirePermPage("feedback_view");
  return (
    <>
      <h1>Feedback</h1>
      <p className="sub">What students and teachers are telling you.</p>
      <AdminFeedbackPanel canManage={canDo(admin, "feedback_manage")} />
    </>
  );
}
