import CirculationPanel from "@/components/CirculationPanel";
import { requirePermPage } from "@/lib/server";

export const metadata = { title: "Circulation — Lang Library" };

export const dynamic = "force-dynamic";

export default async function AdminCirculationPage() {
  await requirePermPage("circulation");
  return (
    <>
      <h1>Circulation</h1>
      <p className="sub">
        Who has which book out, how long it&rsquo;s been gone, and what came back. Students check
        out from any book card; teachers can check out on a student&rsquo;s behalf.
      </p>
      <CirculationPanel />
    </>
  );
}
