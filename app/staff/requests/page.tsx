import RequestsPanel from "@/components/RequestsPanel";

export default function StaffRequests() {
  return (
    <div className="wrap">
      <h1>Book Requests</h1>
      <p className="sub">
        Request books for your class and see what the library already has on the shelves.
      </p>
      <RequestsPanel />
    </div>
  );
}
