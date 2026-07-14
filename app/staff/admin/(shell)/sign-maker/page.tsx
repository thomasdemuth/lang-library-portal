import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { redirect } from "next/navigation";

/** The sign maker, embedded in the admin shell so navigation stays put. */
export default async function SignMakerPage() {
  const admin = await requireAdminPage();
  if (!canDo(admin, "signmaker")) redirect("/admin");

  return (
    <div className="signmaker-wrap">
      <iframe src="/admin/sign-maker/frame" title="Sign Maker" />
    </div>
  );
}
