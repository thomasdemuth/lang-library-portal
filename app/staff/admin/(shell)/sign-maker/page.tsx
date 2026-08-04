import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { withBase } from "@/lib/base";

/** The sign maker, embedded in the admin shell so navigation stays put. */
export default async function SignMakerPage() {
  const admin = await requireAdminPage();
  if (!canDo(admin, "signmaker")) redirect("/admin");

  return (
    <div className="signmaker-wrap">
      <iframe src={withBase("/admin/sign-maker/frame")} title="Sign Maker" />
    </div>
  );
}
