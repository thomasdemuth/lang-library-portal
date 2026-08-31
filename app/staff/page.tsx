import { currentSession } from "@/lib/server";
import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/labels";
import { Ic } from "@/components/icons";
import TeacherPicks from "@/components/TeacherPicks";
import { withBase } from "@/lib/base";

export const metadata = { title: "Home — Lang Library" };

export const dynamic = "force-dynamic";

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

      <TeacherPicks />

      {requests.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Your book requests</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {requests.map((r) => (
              <a
                key={r.id}
                href={withBase("/requests")}
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
                {/* Same status-pill vocabulary as the requests page (RequestsPanel). */}
                <span className="pill" style={{ background: r.status === "ready" ? "#e7f6f3" : "#eef0f5" }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </a>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            <a href={withBase("/requests")}>All requests →</a>
          </p>
        </div>
      )}

      <div className="cards">
        <a className="card navcard" href={withBase("/search")}>
          <h2>
            <span className="navcard-icon" style={{ background: "#2e50c8" }}>
              <Ic name="search" size={17} />
            </span>
            Find a Book
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Search the catalog and see which shelf it lives on.</p>
        </a>
        <a className="card navcard" href={withBase("/requests")}>
          <h2>
            <span className="navcard-icon" style={{ background: "#b2222c" }}>
              <Ic name="requests" size={17} />
            </span>
            Request books
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Class sets and new titles.</p>
        </a>
        <a className="card navcard" href={withBase("/map")}>
          <h2>
            <span className="navcard-icon" style={{ background: "#2e3b8e" }}>
              <Ic name="map" size={17} />
            </span>
            Library Map
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Where everything lives.</p>
        </a>
        <a className="card navcard" href={withBase("/games")}>
          <h2>
            <span className="navcard-icon" style={{ background: "#4caf50" }}>
              <Ic name="dice" size={17} />
            </span>
            Games
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Browse the games collection.</p>
        </a>
        <a className="card navcard" href={withBase("/feedback")}>
          <h2>
            <span className="navcard-icon" style={{ background: "#29ac9c" }}>
              <Ic name="feedback" size={17} />
            </span>
            Feedback
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Tell the library team anything.</p>
        </a>
      </div>
    </div>
  );
}
