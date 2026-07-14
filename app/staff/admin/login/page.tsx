import AdminLoginForm from "@/components/AdminLoginForm";

export default function AdminLogin() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src="/icon-192.png" alt="Lang Library" width={76} height={76} />
        <h1>Management sign-in</h1>
        <p className="sub">For library management accounts only.</p>
      </div>
      <div className="card">
        <AdminLoginForm />
        <p className="hint" style={{ marginTop: 12 }}>
          Teachers don&rsquo;t need an account — <a href="/gate">enter with your school email</a>.
        </p>
      </div>
    </div>
  );
}
