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
      {/* On the phone this tab is the map VIEWER — editing tools stay on desktop */}
      <h1 className="desk-only">Map Editor</h1>
      <h1 className="mobile-only">Library Map</h1>
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
      <p className="sub mobile-only">Pinch to zoom, drag to pan, tap a shelf for details.</p>
      {canFloorplan && (
        <div className="desk-only">
          <FloorplanUpload />
        </div>
      )}
      <LibraryMap editable={canEdit} />
    </>
  );
}
