export default function StaffHome() {
  return (
    <div className="wrap">
      <h1>Welcome to the Lang Library</h1>
      <p className="sub">Request books for your class, browse the shelves, or leave feedback.</p>
      <div className="cards">
        <a className="card" href="/requests">
          <h2>
            <span className="dot" style={{ background: "#b2222c" }} />
            Book Requests
          </h2>
          <p>Need copies for your class? Submit a request and see what the library already has on the shelves.</p>
        </a>
        <a className="card" href="/map">
          <h2>
            <span className="dot" style={{ background: "#2e3b8e" }} />
            Library Map
          </h2>
          <p>See where every genre and section lives, shelf by shelf.</p>
        </a>
        <a className="card" href="/feedback">
          <h2>
            <span className="dot" style={{ background: "#29ac9c" }} />
            Feedback
          </h2>
          <p>Ideas, issues, wishes — straight to the library team.</p>
        </a>
      </div>
    </div>
  );
}
