self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "家事通知", body: event.data.text() };
  }

  const title = payload.title || "家事通知";
  const body = payload.body || "";
  const url = payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/app-icon.svg",
      badge: "/app-icon.svg",
      data: { url },
      tag: payload.type || "kaji",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => "focus" in c);
      if (client) {
        client.focus();
        client.navigate(url);
        return;
      }
      self.clients.openWindow(url);
    }),
  );
});

