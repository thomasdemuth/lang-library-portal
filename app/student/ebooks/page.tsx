import { Ic } from "@/components/icons";
import { withBase } from "@/lib/base";

export const metadata = { title: "E-Books — Lang Library" };

/**
 * E-Books explainer (v8): expectations are set HERE, before anyone leaves
 * the site — our e-books live on OverDrive, a public-library app, and
 * borrowing needs a (free) public-library card. The external button says
 * "new tab" out loud, visually and to screen readers.
 */
export default function EbooksPage() {
  return (
    <div className="wrap student-theme" style={{ textAlign: "center", paddingTop: 60 }}>
      <div className="soon-icon"><Ic name="tablet" size={56} /></div>
      <h1 style={{ justifyItems: "center" }}>E-Books live on OverDrive</h1>
      <p className="sub" style={{ maxWidth: 440, margin: "0 auto 10px" }}>
        Read on a screen — our e-books live on OverDrive, a public-library app.
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
