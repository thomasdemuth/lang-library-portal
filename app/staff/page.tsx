import { currentSession } from "@/lib/server";
import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/labels";
import { Ic } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  new: "#eef0f5",
  in_progress: "#fff6e6",
  ordered: "#eef1fb",
  ready: "#e7f6f3",
  declined: "#fdecec",
};

type MyRequest = { id: number; title: string; status: string; created_at: string };

/** The signed-in teacher's most recent requests, newest first. */
async function myRequests(email: string | undefined): Promise<MyRequest[]> {
  if (!email) return [];
  const { data } = await db()
    .from("book_requests")
    .select("id, title, status, created_at")
    .eq("requester_email", email)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as MyRequest[];
}

export default async function StaffHome() {
  const session = await currentSession();
  const requests = await myRequests(session?.email);

  return (
    <div className="wrap">
      <h1>Welcome to the Lang Library</h1>
      <p className="sub">Request books for your class, browse the shelves, or leave feedback.</p>

      {requests.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Your book requests</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {requests.map((r) => (
              <a
                key={r.id}
                href="/requests"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </span>
                <span className="pill" style={{ background: STATUS_COLORS[r.status] ?? "#eef0f5" }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </a>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            <a href="/requests">All requests →</a>
          </p>
        </div>
      )}

      <div className="cards">
        <a className="card navcard" href="/requests">
          <h2>
            <span className="navcard-icon" style={{ background: "#b2222c" }}>
              <Ic name="requests" size={17} />
            </span>
            Book Requests
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Need copies for your class? Submit a request and see what the library already has on the shelves.</p>
        </a>
        <a className="card navcard" href="/map">
          <h2>
            <span className="navcard-icon" style={{ background: "#2e3b8e" }}>
              <Ic name="map" size={17} />
            </span>
            Library Map
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>See where every genre and section lives, shelf by shelf.</p>
        </a>
        <a className="card navcard" href="/feedback">
          <h2>
            <span className="navcard-icon" style={{ background: "#29ac9c" }}>
              <Ic name="feedback" size={17} />
            </span>
            Feedback
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Ideas, issues, wishes — straight to the library team.</p>
        </a>
      </div>
    </div>
  );
}
