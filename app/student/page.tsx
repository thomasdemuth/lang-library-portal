export default function StudentHome() {
  return (
    <div className="wrap">
      <h1>Welcome to the Lang Library</h1>
      <p className="sub">Find your way around the shelves, or tell us what you think.</p>
      <div className="cards">
        <a className="card" href="/search">
          <h2>
            <span className="dot" style={{ background: "#b2222c" }} />
            Find a Book
          </h2>
          <p>Search every book in the library and see exactly which shelf it lives on.</p>
        </a>
        <a className="card" href="/map">
          <h2>
            <span className="dot" style={{ background: "#2e3b8e" }} />
            Library Map
          </h2>
          <p>See where every genre lives. Zoom in and tap a shelf to see what&rsquo;s on it.</p>
        </a>
        <a className="card" href="/feedback">
          <h2>
            <span className="dot" style={{ background: "#29ac9c" }} />
            Feedback
          </h2>
          <p>Book wishes, ideas, problems — the library team reads everything.</p>
        </a>
      </div>
    </div>
  );
}
