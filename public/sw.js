/* Service Worker — notificaciones de chats. */
const SW_VERSION = "2026-06-25-2";

self.addEventListener("install", (event) => {
  console.info("[sw]", SW_VERSION, "install");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info("[sw]", SW_VERSION, "activate");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  console.info("[sw]", SW_VERSION, "push event recibido");
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Nuevo mensaje", body: event.data ? event.data.text() : "" };
  }
  console.info("[sw] payload:", payload);
  const title = payload.title || "Nuevo mensaje";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon.png",
    badge: payload.badge || "/icon.png",
    tag: payload.tag || (payload.conversationId ? `chat-${payload.conversationId}` : undefined),
    data: {
      url:
        payload.url ||
        (payload.conversationId
          ? `/dashboard/conversaciones?id=${encodeURIComponent(payload.conversationId)}`
          : "/dashboard/conversaciones"),
    },
    silent: false,
    vibrate: [120, 40, 60, 40, 60],
    requireInteraction: false,
    renotify: true,
  };
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => console.info("[sw] noti mostrada"))
      .catch((err) => console.error("[sw] showNotification error:", err))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard/conversaciones";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of allClients) {
        try {
          const cu = new URL(c.url);
          if (cu.origin === self.location.origin) {
            await c.focus();
            if ("navigate" in c) {
              try { await c.navigate(targetUrl); } catch { /* ignorar */ }
            }
            return;
          }
        } catch { /* ignorar */ }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});

// Si el cliente manda { type: "skipWaiting" }, el SW activa la nueva versión
// inmediatamente — usado por ServiceWorkerRegister cuando detecta update.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skipWaiting") {
    console.info("[sw] skipWaiting recibido del cliente");
    self.skipWaiting();
  }
});
