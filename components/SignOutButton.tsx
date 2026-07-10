"use client";

export default function SignOutButton() {
  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/gate";
    }
  }
  return (
    <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={signOut}>
      Sign out
    </button>
  );
}
