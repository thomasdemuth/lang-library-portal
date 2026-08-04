import { Ic } from "@/components/icons";
import { withBase } from "@/lib/base";

export const metadata = { title: "Audiobooks — Lang Library" };

/**
 * Audiobooks explainer (v8): expectations are set HERE, before anyone
 * leaves the site — audiobooks live on OverDrive, a public-library app,
 * and borrowing needs a (free) public-library card. The external button
 * says "new tab" out loud, visually and to screen readers.
 */
export default function AudiobooksPage() {
  return (
    <div className="wrap student-theme" style={{ textAlign: "center", paddingTop: 60 }}>
      <div className="soon-icon"><Ic name="headphones" size={56} /></div>
      <h1 style={{ justifyItems: "center" }}>Audiobooks live on OverDrive</h1>
      <p className="sub" style={{ maxWidth: 440, margin: "0 auto 10px" }}>
        Stories read aloud — they live on OverDrive, a public-library app. Great for listening along
        while you read the paper copy.
      </p>
      <p className="sub" style={{ maxWidth: 440, margin: "0 auto 22px" }}>
        You&rsquo;ll need a public-library card to borrow. No card yet? Ask your teacher — it&rsquo;s free.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <a
          className="btn brand"
          href="https://nypl.overdrive.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open OverDrive (opens in a new tab)"
        >
          Open OverDrive (new tab) <span aria-hidden>↗</span>
        </a>
        <a className="btn" href={withBase("/search")}>Find a paper book instead</a>
      </div>
    </div>
  );
}
