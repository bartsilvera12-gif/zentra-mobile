/* Service Worker — notificaciones de chats.
 *
 * Cubre dos casos:
 *  1) Foreground: el hook `useChatNotifications` llama `registration.showNotification`
 *     a través de este SW para que las notis sigan vivas aunque el tab se cierre
 *     mientras la noti está visible.
 *  2) Background / app cerrada: si el backend manda un Web Push (VAPID), este SW
 *     lo recibe y muestra la noti. El backend de push real (suscripción + envío)
 *     queda fuera del scope de este archivo; acá está la pieza del cliente lista.
 *
 * No hay caching offline — esto es solo notificaciones.
 */

self.addEventListener("install", (event) => {
  // Activación inmediata sin esperar a que se cierren todos los tabs.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Nuevo mensaje", body: event.data ? event.data.text() : "" };
  }
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
    // En Android suena/vibra automáticamente si el usuario tiene volumen.
    vibrate: [60, 30, 60],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard/conversaciones";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reusar tab existente si alguno ya tiene la app abierta.
      for (const c of allClients) {
        try {
          const cu = new URL(c.url);
          if (cu.origin === self.location.origin) {
            await c.focus();
            // Navegar el tab existente al chat correspondiente.
            if ("navigate" in c) {
              try { await c.navigate(targetUrl); } catch { /* ignorar fallos */ }
            }
            return;
          }
        } catch {
          /* url inválida, seguir */
        }
      }
      // Sin tab abierto: abrir uno nuevo.
      await self.clients.openWindow(targetUrl);
    })()
  );
});
