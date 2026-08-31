import SignInForm from "@/components/SignInForm";
import { googleConfigured } from "@/lib/google-oauth";
import { withBase } from "@/lib/base";

export const dynamic = "force-dynamic";

/**
 * The universal sign-in page — what "/" renders on the unified host
 * (library.thelangschool.org). Students and teachers sign in with their
 * school Google account; anyone may continue as a guest (Find a Book + Map).
 * Management signs in at /admin/login. The middleware only ever serves this
 * page to signed-out visitors.
 *
 * v8: one centered column — logo tile, "Lang Library" once, the Google
 * button, a quiet guest link. Nothing else competes.
 */
export default function SignInPage() {
  const google = googleConfigured();

  return (
    <div className="wrap narrow signin">
      <div className="gate-hero signin-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src={withBase("/icon-192.png")} alt="Lang Library" width={76} height={76} />
        <h1>Lang Library</h1>
      </div>
      <div className="card signin-card">
        <SignInForm google={google} />
      </div>
    </div>
  );
}
