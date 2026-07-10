export default function NotFound() {
  return (
    <div className="wrap narrow" style={{ textAlign: "center", paddingTop: 80 }}>
      <h1>Page not found</h1>
      <p className="sub">That page doesn&rsquo;t exist here.</p>
      <a className="btn" href="/">
        Go home
      </a>
    </div>
  );
}
