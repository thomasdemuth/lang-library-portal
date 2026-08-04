/* Lang Library service worker: receives app-update push notifications. */

/**
 * Subpath deployments: this file is static, so it can't read an env var — it
 * derives its own prefix from where it was served instead. At the domain root
 * self.location is /sw.js and BASE is ""; at /new2/sw.js BASE is "/new2".
 * Every URL below is composed through it.
 */
const BASE = new URL("./", self.location.href).pathname.replace(/\/$/, "");
const ICON = `${BASE}/icon-192.png`;
const FALLBACK_URL = `${BASE}/admin/updates`;

self.addEventListener("push", (event) => {
  let data = { title: "Lang Library", body: "" };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Lang Library", {
      body: data.body || "",
      icon: ICON,
      badge: ICON,
      data: { url: data.url || FALLBACK_URL },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || FALLBACK_URL;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) {
          win.navigate(url);
          return win.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
