import LibraryMap from "@/components/map/LibraryMap";

export const metadata = { title: "Library Map — Lang Library" };

export default function StudentMap() {
  return (
    <div className="wrap" style={{ maxWidth: 1280 }}>
      <h1>Library Map</h1>
      <p className="sub">Zoom around and tap any shelf to see what lives there.</p>
      <LibraryMap editable={false} />
    </div>
  );
}
