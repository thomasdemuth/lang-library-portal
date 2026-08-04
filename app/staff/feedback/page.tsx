import FeedbackForm from "@/components/FeedbackForm";

export const metadata = { title: "Feedback — Lang Library" };

export default function StaffFeedback() {
  return (
    <div className="wrap narrow">
      <h1>Feedback</h1>
      <p className="sub">Anything for the library team — straight to the management dashboard.</p>
      <div className="card">
        <FeedbackForm audience="staff" />
      </div>
    </div>
  );
}
