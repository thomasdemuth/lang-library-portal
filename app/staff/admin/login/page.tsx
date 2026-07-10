import AdminLoginForm from "@/components/AdminLoginForm";

export default function AdminLogin() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        <span className="mark">Lang Library</span>
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
