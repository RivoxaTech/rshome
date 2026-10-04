// The panel's push service worker (BUILD_PLAN.md S21). Registered only inside the panel
// (components/panel/notifications/NotificationBell.tsx), never for the storefront. The push
// payload is always { title, body, url, tag } (features/notify/events.ts) — never a customer
// name, phone, address, email or amount.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Only this origin's own pages are ever opened from a notification: a payload URL pointing
// anywhere else (which would take a compromised server to produce) falls back to the panel.
function panelUrl(candidate) {
  try {
    const url = new URL(candidate, self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/panel", self.location.origin).href;
  } catch {
    return new URL("/panel", self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  const title = payload.title || "RS Home";
  const options = {
    body: payload.body || "",
    tag: payload.tag || "rshome",
    // A repeat of a tag already shown (e.g. a second wholesale inquiry while the first
    // notification is still up) still alerts the user instead of silently replacing it.
    renotify: true,
    data: { url: panelUrl(payload.url || "/panel") },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = panelUrl(event.notification.data && event.notification.data.url ? event.notification.data.url : "/panel");

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url === targetUrl && "focus" in client) {
          await client.focus();
          return;
        }
      }
      for (const client of allClients) {
        if ("navigate" in client && "focus" in client) {
          await client.focus();
          await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
