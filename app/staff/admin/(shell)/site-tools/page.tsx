import BannersPanel from "@/components/BannersPanel";
import { requirePermPage } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Site Tools — controls over how the student and teacher sites themselves
 * present, as opposed to the library's contents. The banner is the first of
 * them; anything later that changes what every visitor sees belongs here too.
 */
export default async function AdminSiteToolsPage() {
  await requirePermPage("banners");
  return (
    <>
      <h1>Site Tools</h1>
      <p className="sub">Settings that change what every visitor to the site sees.</p>

      <h2 style={{ fontSize: 15, margin: "22px 0 4px" }}>Banner</h2>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        The strip across the top of every student and teacher page. One shows at a time — give a
        banner a start date and it takes over by itself. Changes reach everyone within a minute.
      </p>
      <BannersPanel />
    </>
  );
}
