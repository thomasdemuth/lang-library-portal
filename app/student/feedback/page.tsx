import FeedbackForm from "@/components/FeedbackForm";
import QuickFeedback from "@/components/QuickFeedback";
import { isSource } from "@/lib/feedback";

export const metadata = { title: "Feedback — Lang Library" };

export default async function StudentFeedback({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  // The banner links here with ?src=banner so we can tell which prompt worked.
  const { src } = await searchParams;

  return (
    <div className="wrap narrow">
      <h1>Feedback</h1>
      <p className="sub">Book wishes, ideas, problems — the library team reads everything.</p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 12 }}>How&rsquo;s the new site?</h2>
        <QuickFeedback
          topic="website"
          source={isSource(src) ? src : "form"}
          endpoint="/api/feedback"
        />
      </div>

      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Something else on your mind?</h2>
      <div className="card">
        <FeedbackForm audience="student" />
      </div>
    </div>
  );
}
