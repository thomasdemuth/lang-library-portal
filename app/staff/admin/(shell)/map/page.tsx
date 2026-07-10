import LibraryMap from "@/components/map/LibraryMap";
import FloorplanUpload from "@/components/map/FloorplanUpload";

export default function AdminMapPage() {
  return (
    <>
      <h1>Map Editor</h1>
      <p className="sub">
        <b>Build</b> mode: drag to draw shelves. <b>Edit</b> mode: drag to move, corner handle to
        resize, click for details. Students and teachers see everything except internal notes.
      </p>
      <FloorplanUpload />
      <LibraryMap editable />
    </>
  );
}
