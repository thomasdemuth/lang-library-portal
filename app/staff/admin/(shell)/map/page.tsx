import LibraryMap from "@/components/map/LibraryMap";
import FloorplanUpload from "@/components/map/FloorplanUpload";
import { requireAdminPage } from "@/lib/server";
import { canDo } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AdminMapPage() {
  const admin = await requireAdminPage();
  const canEdit = canDo(admin, "map_edit");
  const canFloorplan = canDo(admin, "map_floorplan");
  if (!canEdit && !canFloorplan) redirect("/admin");

  return (
    <>
      {/* On the phone this tab is just the map — no title, no editing tools */}
      <h1 className="desk-only">Map Editor</h1>
      <p className="sub desk-only">
        {canEdit ? (
          <>
            <b>Build</b> mode: drag to draw shelves. <b>Edit</b> mode: drag to move, corner handle to
            resize, click for details.{" "}
          </>
        ) : (
          <>You can replace the floor-plan image. </>
        )}
        Students and teachers see everything except internal notes.
      </p>
      {canFloorplan && (
        <div className="desk-only">
          <FloorplanUpload />
        </div>
      )}
      <LibraryMap editable={canEdit} />
    </>
  );
}
