import GateForm from "@/components/GateForm";

export default function StudentGate() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src="/icon-192.png" alt="Lang Library" width={76} height={76} />
        <h1>Student portal</h1>
        <p className="sub">Enter your school email to come in.</p>
      </div>
      <div className="card">
        <GateForm placeholder="you@students.thelangschool.org" />
        <p className="hint" style={{ marginTop: 12 }}>
          Teachers &amp; staff: this is the student site — use the staff site instead.
        </p>
      </div>
    </div>
  );
}
