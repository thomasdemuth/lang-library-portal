import { Ic } from "@/components/icons";

export default function ComingSoonPage() {
  return (
    <div className="wrap student-theme" style={{ textAlign: "center", paddingTop: 60 }}>
      <div className="soon-icon"><Ic name="tablet" size={56} /></div>
      <h1 style={{ justifyItems: "center" }}>E-Books are coming soon</h1>
      <p className="sub" style={{ maxWidth: 420, margin: "0 auto 22px" }}>
        A digital shelf you can read anywhere is on its way. For now, every paper book in the library is one search away.
      </p>
      <a className="btn brand" href="/search">Find a paper book instead</a>
    </div>
  );
}
