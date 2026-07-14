"use client";

import { useEffect, useState } from "react";

type State = "unsupported" | "checking" | "off" | "on" | "denied";

/** Enable/disable push notifications for THIS device. */
export default function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = await fetch("/api/admin/push").then((r) => r.json());
      if (!publicKey) {
        setError("Notifications aren't configured on the server yet.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't register this device.");
        await sub.unsubscribe();
        return;
      }
      setState("on");
    } catch {
      setError("Couldn't enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported")
    return (
      <p className="hint" style={{ margin: 0 }}>
        Push notifications need the home-screen app (Share → Add to Home Screen), then enable here.
      </p>
    );
  if (state === "denied")
    return (
      <p className="hint" style={{ margin: 0 }}>
        Notifications are blocked for this app in your device settings.
      </p>
    );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {error && <span className="hint" style={{ color: "var(--danger)", margin: 0 }}>{error}</span>}
      {state === "on" ? (
        <>
          <span className="pill" style={{ background: "#e7f6f3" }}>enabled on this device</span>
          <button className="btn ghost" disabled={busy} onClick={disable} style={{ padding: "6px 10px", fontSize: 12 }}>
            Turn off
          </button>
        </>
      ) : (
        <button className="btn" disabled={busy || state === "checking"} onClick={enable}>
          {busy ? "Enabling…" : "🔔 Enable on this device"}
        </button>
      )}
    </div>
  );
}
