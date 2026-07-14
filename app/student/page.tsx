import NewBooksShelf from "@/components/NewBooksShelf";
import { Ic } from "@/components/icons";

export default function StudentHome() {
  return (
    <div className="wrap">
      <h1>Welcome to the Lang Library</h1>
      <p className="sub">Find your next favorite book, see where it lives, or tell us what you think.</p>

      <NewBooksShelf />

      <div className="cards" style={{ marginTop: 18 }}>
        <a className="card navcard" href="/search">
          <h2>
            <span className="navcard-icon" style={{ background: "#b2222c" }}>
              <Ic name="search" size={17} />
            </span>
            Find a Book
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Search every book in the library and see exactly which shelf it lives on.</p>
        </a>
        <a className="card navcard" href="/map">
          <h2>
            <span className="navcard-icon" style={{ background: "#2e3b8e" }}>
              <Ic name="map" size={17} />
            </span>
            Library Map
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>See where every genre lives. Zoom in and tap a shelf to see what&rsquo;s on it.</p>
        </a>
        <a className="card navcard" href="/feedback">
          <h2>
            <span className="navcard-icon" style={{ background: "#29ac9c" }}>
              <Ic name="feedback" size={17} />
            </span>
            Feedback
            <span className="navcard-arrow" aria-hidden>→</span>
          </h2>
          <p>Book wishes, ideas, problems — the library team reads everything.</p>
        </a>
      </div>
    </div>
  );
}
