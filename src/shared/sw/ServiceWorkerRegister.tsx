"use client";

import { useEffect } from "react";
import { ensurePushSubscription } from "@/shared/hooks/useChatNotifications";

/**
 * Registra `/sw.js` apenas el cliente arranca. Tolerante a fallos: si el browser
 * no soporta service workers (Safari viejo) simplemente no hace nada y la app
 * sigue funcionando — el hook de notificaciones cae a `new Notification(...)`.
 *
 * Si el usuario ya concedió permiso de notificaciones en una sesión previa,
 * aprovechamos para refrescar la suscripción Push contra el backend (por si el
 * endpoint expiró). Esto permite que las notis lleguen aunque la app esté
 * completamente cerrada.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        return; // sin SW, sigue funcionando foreground
      }
      // Re-sincronizar suscripción si ya tenemos permiso.
      if ("Notification" in window && Notification.permission === "granted") {
        void ensurePushSubscription();
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }, []);
  return null;
}
