import RequestsPanel from "@/components/RequestsPanel";

export default function StaffRequests() {
  return (
    <div className="wrap">
      <h1>Book Requests</h1>
      <p className="sub">
        Request books for your class — we instantly check whether the library has enough copies.
      </p>
      <RequestsPanel />
    </div>
  );
}
