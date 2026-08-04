import { createHash } from "node:crypto";
import InviteClaimForm from "@/components/InviteClaimForm";
import { db, dbConfigured } from "@/lib/db";

// The token lookup must run fresh on every visit.
export const dynamic = "force-dynamic";

type LinkState = { state: "invite" } | { state: "reset" } | { state: "dead"; kind: "invite" | "reset" };

/**
 * Pre-check the link before rendering the form, so a dead link shows a clear
 * message instead of wasting a fully filled-in form. Best-effort only: when
 * the lookup can't run (no DB config, transient error) we fall through to the
 * form — the claim API's atomic consumption stays the authoritative check.
 */
async function checkToken(token: string): Promise<LinkState> {
  if (!dbConfigured()) return { state: "invite" };
  try {
    const hash = createHash("sha256").update(token).digest("hex");
    let { data, error } = await db()
      .from("invite_tokens")
      .select("kind, expires_at, used_at, revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();
    // Resilience: before migration 0023, the kind column doesn't exist.
    if (error && /kind|column/i.test(error.message ?? "")) {
      ({ data, error } = await db()
        .from("invite_tokens")
        .select("expires_at, used_at, revoked_at")
        .eq("token_hash", hash)
        .maybeSingle());
    }
    if (error) return { state: "invite" };
    const row = data as { kind?: string; expires_at: string; used_at: string | null; revoked_at: string | null } | null;
    const kind: "invite" | "reset" = row?.kind === "reset" ? "reset" : "invite";
    if (!row || row.used_at || row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return { state: "dead", kind };
    }
    return { state: kind };
  } catch {
    return { state: "invite" };
  }
}

export default async function InviteClaim({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await checkToken(token);

  if (link.state === "dead") {
    return (
      <div className="wrap narrow">
        <div className="gate-hero">
          <span className="mark">Lang Library</span>
          <h1>This link doesn&rsquo;t work anymore</h1>
          <p className="sub">
            {link.kind === "reset" ? "Password-reset links" : "Invite links"} are single-use and expire.
          </p>
        </div>
        <div className="card">
          <p style={{ margin: 0 }}>
            This {link.kind === "reset" ? "reset" : "invite"} link has expired or was already used —
            ask your chief admin for a fresh one.
          </p>
        </div>
      </div>
    );
  }

  if (link.state === "reset") {
    return (
      <div className="wrap narrow">
        <div className="gate-hero">
          <span className="mark">Lang Library</span>
          <h1>Reset your password</h1>
          <p className="sub">
            Choose a new password for your management account. This link works once, and any other
            signed-in sessions end when you set it.
          </p>
        </div>
        <div className="card">
          <InviteClaimForm token={token} mode="reset" />
        </div>
      </div>
    );
  }

  return (
    <div className="wrap narrow">
      <div className="gate-hero">
        <span className="mark">Lang Library</span>
        <h1>You&rsquo;re invited</h1>
        <p className="sub">Set up your library management account. This link works once.</p>
      </div>
      <div className="card">
        <InviteClaimForm token={token} />
      </div>
    </div>
  );
}
