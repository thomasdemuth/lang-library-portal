import AnalyticsPanel from "@/components/AnalyticsPanel";

export default function AnalyticsPage() {
  return (
    <>
      <h1>Site Usage</h1>
      <p className="sub">
        Page views across the student and staff sites. Counted on real page loads only — assets and
        prefetches are excluded, and logging never slows a request.
      </p>
      <AnalyticsPanel />
    </>
  );
}
