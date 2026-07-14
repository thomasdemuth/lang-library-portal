export default function ComingSoonPage() {
  return (
    <div className="wrap student-theme" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>🎧</div>
      <h1 style={{ justifyItems: "center" }}>Audiobooks are coming soon</h1>
      <p className="sub" style={{ maxWidth: 420, margin: "0 auto 22px" }}>
        Stories read aloud are coming to the library. Until then, grab the paper version — it's on the map!
      </p>
      <a className="btn brand" href="/search">Find a paper book instead</a>
    </div>
  );
}
