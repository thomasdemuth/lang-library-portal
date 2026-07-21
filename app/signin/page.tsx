import SignInForm from "@/components/SignInForm";

/**
 * The universal sign-in page — what "/" renders on the unified host
 * (library.thelangschool.org). One email field for everyone; registered
 * management accounts get a password field revealed inline. The middleware
 * only ever serves this to signed-out visitors (signed-in ones are
 * redirected to their portal home).
 */
export default function SignInPage() {
  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src="/icon-192.png" alt="Lang Library" width={76} height={76} />
        <h1>Lang Library</h1>
        <p className="sub">Sign in with your school email to come in.</p>
      </div>
      <div className="card">
        <SignInForm />
      </div>
    </div>
  );
}
