self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification("家事通知", { tag: "kaji-fallback" }),
    );
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "家事通知", body: event.data.text() };
  }

  const title = payload.title || "家事通知";
  const body = payload.body || "";
  const url = payload.url || "/";
  const tag = (payload.type || "kaji") + "-" + Date.now();

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192-v2.png",
      badge: "/icon-192-v2.png",
      data: { url },
      tag,
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
