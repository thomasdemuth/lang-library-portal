import QuickFeedback from "@/components/QuickFeedback";
import { withBase } from "@/lib/base";
import { resolveSpot } from "@/lib/feedback-spots";
import { loadSpotShelves } from "@/lib/feedback-store";

/**
 * What a QR poster in the library opens: one question, no sign-in, no chrome.
 *
 * This page lives OUTSIDE the /student and /staff trees on purpose — the
 * middleware rewrites everything inside those into a portal for a signed-in
 * session, and this has to work for someone holding a phone with no account.
 * The <code> in the URL is resolved server-side (lib/feedback-spots) so the
 * heading names the right zone and the submission is tagged with it.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tell us what you think — Lang Library",
  robots: { index: false },
};

export default async function SpotFeedback({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const spot = resolveSpot(code, await loadSpotShelves());

  return (
    <main className="wrap narrow">
      <div className="hi-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hi-logo"
          src={withBase("/icon-192.png")}
          alt="Lang Library"
          width={64}
          height={64}
        />
        {spot.category && (
          <div>
            <span className="hi-zone" style={{ background: spot.color }}>
              {spot.label}
            </span>
          </div>
        )}
        <h1>{spot.heading}</h1>
        <p className="sub">
          {spot.topic === "website"
            ? "We just rebuilt the library website. Tell us how it's going — it's anonymous and takes a few seconds."
            : "We just re-did the library. Tell us how it's going — it's anonymous and takes a few seconds."}
        </p>
      </div>
      <div className="card">
        <QuickFeedback
          topic={spot.topic}
          spot={spot.code}
          source="qr"
          endpoint="/api/feedback/public"
          askName
        />
      </div>
      <p className="hint" style={{ textAlign: "center", marginTop: 16 }}>
        Looking for a book? <a href={withBase("/")}>Open the library site</a>.
      </p>
    </main>
  );
}
