import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { withBase } from "@/lib/base";
import { PREVIEW_COOKIE, verifyPreviewToken } from "@/lib/preview";

export const dynamic = "force-dynamic";

/**
 * Reviewer entrance to the staging deployment (staging ONLY — the first line
 * renders the app's 404 when the staging-only PREVIEW_KEY env var is unset,
 * so this page does not exist in production behavior).
 *
 * Flow: the reviewer lands here from the "Visit the new site" button, enters
 * the preview key once (or arrives with it in a ?key=… link), gets a 30-day
 * signed `lang_preview` cookie, and then sees the role switcher: one tap
 * mints a synthetic student / teacher / management session and drops them
 * into the app. Cookies are set by /api/preview (server components can't).
 */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; error?: string }>;
}) {
  if (!process.env.PREVIEW_KEY) notFound();

  const params = await searchParams;
  const jar = await cookies();
  const authorized = await verifyPreviewToken(jar.get(PREVIEW_COOKIE)?.value);

  // ?key=… one-tap links never reach this page: the middleware redirects
  // /preview?key=… to /api/preview?key=… (which sets the reviewer cookie and
  // returns here) before the page renders. A server-component redirect can't
  // do that handoff — Next's redirect() mangles the basePath on subpath
  // staging deployments — so the middleware owns it.

  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="gate-logo" src={withBase("/icon-192.png")} alt="Lang Library" width={76} height={76} />
        <h1>Preview</h1>
        <p className="sub">
          {authorized ? "Choose how to view the new site." : "An early look at the new Lang Library."}
        </p>
      </div>
      <div className="card">{authorized ? <RoleSwitcher /> : <KeyForm badKey={params.error === "badkey"} />}</div>
    </div>
  );
}

const ROLES = [
  {
    role: "student",
    label: "View as student",
    desc: "The student portal — search, reading log, games, library map.",
  },
  {
    role: "staff",
    label: "View as teacher",
    desc: "The staff portal — find a book, class requests, games.",
  },
  {
    role: "admin",
    label: "View as management",
    desc: "The management interface — inventory, requests, map editing, analytics.",
  },
] as const;

function RoleSwitcher() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {ROLES.map((r) => (
        <div key={r.role}>
          <a className="btn brand" href={withBase(`/api/preview?role=${r.role}`)}>
            {r.label}
          </a>
          <p className="hint" style={{ marginTop: 6 }}>
            {r.desc}
          </p>
        </div>
      ))}
      <p className="hint" style={{ marginTop: 4 }}>
        Preview mode — actions here use test accounts against the real library data. Come back to this
        page any time to switch roles.
      </p>
    </div>
  );
}

function KeyForm({ badKey }: { badKey: boolean }) {
  return (
    <form method="post" action={withBase("/api/preview")}>
      <label className="lbl" htmlFor="preview-key">
        Preview key
      </label>
      <input
        id="preview-key"
        className="input"
        type="password"
        name="key"
        autoComplete="off"
        required
        autoFocus
      />
      {badKey && (
        <p className="hint" role="alert">
          That key isn&rsquo;t right — check the message you were sent, or ask the library.
        </p>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        This preview is for invited reviewers. Enter the key you were given — you&rsquo;ll only need to
        do this once on this device.
      </p>
      <button className="btn brand" type="submit" style={{ marginTop: 12 }}>
        Enter the preview
      </button>
    </form>
  );
}
