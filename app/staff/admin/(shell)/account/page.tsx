import { requireAdminPage } from "@/lib/server";
import { db } from "@/lib/db";
import PasswordForm from "@/components/PasswordForm";
import ProfileForm from "@/components/ProfileForm";
import NotificationPrefs from "@/components/NotificationPrefs";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import MobileSettings from "@/components/MobileSettings";
import SignOutButton from "@/components/SignOutButton";
import LaunchPrefCard from "@/components/LaunchPrefCard";
import { canPublishUpdates } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** Preference columns newer than the shared identity select (pre-migration-safe). */
async function extraPrefs(adminId: string): Promise<{ weekly: boolean | null; updates: boolean | null }> {
  try {
    let { data, error } = await db()
      .from("admins")
      .select("notify_weekly, notify_updates")
      .eq("id", adminId)
      .maybeSingle();
    if (error && /notify_updates|column/i.test(error.message ?? "")) {
      ({ data, error } = await db().from("admins").select("notify_weekly").eq("id", adminId).maybeSingle());
    }
    if (error) return { weekly: null, updates: null };
    const row = (data ?? {}) as { notify_weekly?: boolean | null; notify_updates?: boolean | null };
    return { weekly: row.notify_weekly ?? null, updates: row.notify_updates ?? null };
  } catch {
    return { weekly: null, updates: null };
  }
}

export default async function AccountPage() {
  const admin = await requireAdminPage();
  const prefs = await extraPrefs(admin.id);
  const notifyWeekly = prefs.weekly;
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
                {admin.name || admin.username}{" "}
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
          notifyUpdates={prefs.updates}
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
          canPublish={canPublishUpdates(admin.email)}
          isChief={admin.role === "chief"}
          selfId={admin.id}
          notifyRequests={admin.notify_requests}
          notifyWeekly={notifyWeekly}
          notifyUpdates={prefs.updates}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
