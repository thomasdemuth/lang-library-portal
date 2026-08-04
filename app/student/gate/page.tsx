import GateForm from "@/components/GateForm";
import { staffUrl } from "@/lib/hosts";
import { withBase } from "@/lib/base";

export default function StudentGate() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src={withBase("/icon-192.png")} alt="Lang Library" width={76} height={76} />
        <h1>Student portal</h1>
        <p className="sub">Enter your school email to come in.</p>
      </div>
      <div className="card">
        <GateForm placeholder="you@students.thelangschool.org" />
        <p className="hint" style={{ marginTop: 12 }}>
          Teachers &amp; staff: this is the student site — <a href={staffUrl()}>go to the staff site</a>.
        </p>
      </div>
    </div>
  );
}
