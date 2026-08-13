import BannersPanel from "@/components/BannersPanel";
import { requirePermPage } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  await requirePermPage("banners");
  return (
    <>
      <h1>Site Banner</h1>
      <p className="sub">
        The strip across the top of every student and teacher page. One shows at a time — give a
        banner a start date and it takes over by itself. Changes reach everyone within a minute.
      </p>
      <BannersPanel />
    </>
  );
}
