import { requireAdminPage } from "@/lib/server";
import { db } from "@/lib/db";
import PasswordForm from "@/components/PasswordForm";
import NotificationPrefs from "@/components/NotificationPrefs";
import DeleteAccountForm from "@/components/DeleteAccountForm";

export const dynamic = "force-dynamic";

/** notify_weekly isn't part of the shared identity select; fetch it here (pre-0005-safe). */
async function weeklyPref(adminId: string): Promise<boolean | null> {
  try {
    const { data, error } = await db().from("admins").select("notify_weekly").eq("id", adminId).maybeSingle();
    if (error) return null;
    return (data?.notify_weekly ?? null) as boolean | null;
  } catch {
    return null;
  }
}

export default async function AccountPage() {
  const admin = await requireAdminPage();
  const notifyWeekly = await weeklyPref(admin.id);
  return (
    <>
      <h1>My account</h1>
      <p className="sub">
        Signed in as <b>{admin.name}</b> ({admin.username} · {admin.email}) ·{" "}
        <span className="pill" style={{ background: admin.role === "chief" ? "#eef1fb" : "#eef0f5" }}>
          {admin.role === "chief" ? "Chief Admin" : "Admin"}
        </span>
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <PasswordForm />
      </div>
      <NotificationPrefs
        isChief={admin.role === "chief"}
        notifyRequests={admin.notify_requests}
        notifyWeekly={notifyWeekly}
      />
      {admin.email.toLowerCase() !== "library@thelangschool.org" && <DeleteAccountForm />}
    </>
  );
}
