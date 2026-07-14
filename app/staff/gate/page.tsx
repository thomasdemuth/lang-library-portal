import GateForm from "@/components/GateForm";

export default function StaffGate() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src="/icon-192.png" alt="Lang Library" width={76} height={76} />
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
