"use client";

import { withBase } from "@/lib/base";

export default function SignOutButton() {
  async function signOut() {
    try {
      await fetch(withBase("/api/logout"), { method: "POST" });
    } finally {
      window.location.href = withBase("/gate");
    }
  }
  return (
    <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={signOut}>
      Sign out
    </button>
  );
}
