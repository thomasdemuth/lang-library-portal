import InviteClaimForm from "@/components/InviteClaimForm";

export default async function InviteClaim({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
