import GateForm from "@/components/GateForm";

export default function StaffGate() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        <span className="mark">Lang Library</span>
        <h1>Staff portal</h1>
        <p className="sub">Enter your school email to come in.</p>
      </div>
      <div className="card">
        <GateForm placeholder="you@thelangschool.org" />
        <p className="hint" style={{ marginTop: 12 }}>
          Library management: <a href="/admin/login">sign in here</a>.
        </p>
      </div>
    </div>
  );
}
