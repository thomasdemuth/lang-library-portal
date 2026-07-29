import SignInForm from "@/components/SignInForm";
import { googleConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * The universal sign-in page — what "/" renders on the unified host
 * (library.thelangschool.org). Students and teachers sign in with their
 * school Google account; anyone may continue as a guest (Find a Book + Map).
 * A dev-only email form appears when NODE_ENV!=="production" (or the
 * ALLOW_EMAIL_LOGIN break-glass is set). Management signs in at /admin/login.
 * The middleware only ever serves this page to signed-out visitors.
 */
export default function SignInPage() {
  const devLogin = process.env.NODE_ENV !== "production" || process.env.ALLOW_EMAIL_LOGIN === "1";
  const google = googleConfigured();

  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src="/icon-192.png" alt="Lang Library" width={76} height={76} />
        <h1>Lang Library</h1>
      </div>
      <div className="card">
        <SignInForm google={google} devLogin={devLogin} />
      </div>
      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        use your google account to access all features
      </p>
    </div>
  );
}
