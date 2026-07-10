import FeedbackForm from "@/components/FeedbackForm";

export default function StudentFeedback() {
  return (
    <div className="wrap narrow">
      <h1>Feedback</h1>
      <p className="sub">Book wishes, ideas, problems — the library team reads everything.</p>
      <div className="card">
        <FeedbackForm audience="student" />
      </div>
    </div>
  );
}
