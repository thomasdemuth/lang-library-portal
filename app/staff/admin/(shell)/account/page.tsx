import { requireAdminPage } from "@/lib/server";
import { db } from "@/lib/db";
import PasswordForm from "@/components/PasswordForm";
import ProfileForm from "@/components/ProfileForm";
import NotificationPrefs from "@/components/NotificationPrefs";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import MobileSettings from "@/components/MobileSettings";
import SignOutButton from "@/components/SignOutButton";
import LaunchPrefCard from "@/components/LaunchPrefCard";

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
  const canDelete = admin.email.toLowerCase() !== "library@thelangschool.org";
  return (
    <>
      <h1>My account</h1>

      {/* Desktop keeps the classic account page (admins live on their own page) */}
      <div className="desk-only">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {admin.username}{" "}
                <span className="pill" style={{ background: admin.role === "chief" ? "#eef1fb" : "#eef0f5", verticalAlign: "middle" }}>
                  {admin.role === "chief" ? "Chief Admin" : "Admin"}
                </span>
              </div>
              <div className="hint" style={{ marginTop: 4, fontSize: 13 }}>{admin.email}</div>
            </div>
            <SignOutButton />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Display name</h2>
          <ProfileForm initialName={admin.name} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Change password</h2>
          <PasswordForm />
        </div>
        <NotificationPrefs
          isChief={admin.role === "chief"}
          notifyRequests={admin.notify_requests}
          notifyWeekly={notifyWeekly}
        />
        <LaunchPrefCard />
        {canDelete && <DeleteAccountForm />}
      </div>

      {/* The phone gets the app-style Settings: grouped tiles with drill-ins */}
      <div className="mobile-only">
        <MobileSettings
          name={admin.name}
          username={admin.username}
          email={admin.email}
          role={admin.role}
          isChief={admin.role === "chief"}
          selfId={admin.id}
          notifyRequests={admin.notify_requests}
          notifyWeekly={notifyWeekly}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
