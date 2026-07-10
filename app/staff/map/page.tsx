import LibraryMap from "@/components/map/LibraryMap";

export default function StaffMap() {
  return (
    <div className="wrap" style={{ maxWidth: 1280 }}>
      <h1>Library Map</h1>
      <p className="sub">Zoom around and click any shelf to see its section and details.</p>
      <LibraryMap editable={false} />
    </div>
  );
}
