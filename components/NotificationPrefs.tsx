"use client";

import { useState } from "react";
import PushToggle from "@/components/PushToggle";

export default function NotificationPrefs({
  isChief,
  notifyRequests,
  notifyWeekly,
  notifyUpdates,
}: {
  isChief: boolean;
  notifyRequests: boolean;
  notifyWeekly: boolean | null;
  notifyUpdates?: boolean | null;
}) {
  const [requests, setRequests] = useState(notifyRequests);
  const [weekly, setWeekly] = useState<boolean>(notifyWeekly ?? isChief);
  const [updates, setUpdates] = useState<boolean>(notifyUpdates ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(patch: { notify_requests?: boolean; notify_weekly?: boolean; notify_updates?: boolean }) {
    setMsg(null);
    const res = await fetch("/api/admin/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json()).error ?? "Couldn't save that." });
      // revert optimistic state
      if (patch.notify_requests !== undefined) setRequests(!patch.notify_requests);
      if (patch.notify_weekly !== undefined) setWeekly(!patch.notify_weekly);
      if (patch.notify_updates !== undefined) setUpdates(!patch.notify_updates);
      return;
    }
    setMsg({ ok: true, text: "Saved." });
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Notifications</h2>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isChief && (
          <label className="check">
            <input
              type="checkbox"
              checked={requests}
              onChange={(e) => {
                setRequests(e.target.checked);
                save({ notify_requests: e.target.checked });
              }}
            />
            Email me when a new book request arrives
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={weekly}
            onChange={(e) => {
              setWeekly(e.target.checked);
              save({ notify_weekly: e.target.checked });
            }}
          />
          Send me the weekly Friday summary
          <span className="hint" style={{ marginTop: 0, fontWeight: 500 }}>
            ({isChief ? "on" : "off"} by default for {isChief ? "Chief Admins" : "Admins"})
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={updates}
            onChange={(e) => {
              setUpdates(e.target.checked);
              save({ notify_updates: e.target.checked });
            }}
          />
          App update announcements
        </label>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 2 }}>
          <PushToggle />
        </div>
      </div>
    </div>
  );
}
