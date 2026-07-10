import { currentAdmin } from "@/lib/server";
import PasswordForm from "@/components/PasswordForm";

export default async function AccountPage() {
  const admin = await currentAdmin();
  return (
    <>
      <h1>My account</h1>
      <p className="sub">
        Signed in as <b>{admin!.name}</b> ({admin!.username} · {admin!.email})
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <PasswordForm />
      </div>
    </>
  );
}
