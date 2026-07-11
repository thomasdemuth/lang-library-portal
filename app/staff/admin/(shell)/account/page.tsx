import { requireAdminPage } from "@/lib/server";
import PasswordForm from "@/components/PasswordForm";

export default async function AccountPage() {
  const admin = await requireAdminPage();
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
    </>
  );
}
