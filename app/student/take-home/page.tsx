import TakeHomeKiosk from "@/components/TakeHomeKiosk";

export const metadata = { title: "Take a Book Home — Lang Library" };

/**
 * Self-checkout for a school computer with no camera: type the title,
 * pick it from the list, one big button. Returns live here too.
 */
export default function TakeHomePage() {
  return (
    <div className="wrap student-theme" style={{ maxWidth: 640 }}>
      <h1>Take a Book Home</h1>
      <p className="sub">Holding the book? Type its title and it&rsquo;s yours in two clicks.</p>
      <TakeHomeKiosk />
    </div>
  );
}
