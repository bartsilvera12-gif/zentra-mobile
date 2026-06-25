"use client";

import { useEffect } from "react";
import { ensurePushSubscription } from "@/shared/hooks/useChatNotifications";

/**
 * Registra `/sw.js` apenas el cliente arranca y fuerza un update check en cada
 * carga (importante: sin esto, el browser puede servir un sw.js cacheado de
 * hace días y nunca tomar las mejoras al `push` handler).
 *
 * Si detecta un SW nuevo esperando activación, le manda `skipWaiting` para que
 * tome el control inmediatamente — la próxima noti push ya usa el handler
 * nuevo sin esperar a que el usuario cierre todas las tabs.
 *
 * Si el usuario ya concedió permiso de notificaciones en una sesión previa,
 * re-sincronizamos la suscripción Push contra el backend (por si la fila se
 * borró o si la VAPID public key cambió).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      let reg: ServiceWorkerRegistration | null = null;
      try {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      } catch {
        return;
      }

      // Buscar SW esperando activación → empujarlo a activarse.
      const promote = (sw: ServiceWorker | null) => {
        if (sw && sw.state === "installed") {
          sw.postMessage({ type: "skipWaiting" });
        }
      };
      if (reg.waiting) promote(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const inst = reg!.installing;
        if (!inst) return;
        inst.addEventListener("statechange", () => promote(inst));
      });

      // Force update check (no espera al heartbeat default de 24h del browser).
      try { await reg.update(); } catch { /* ignorar */ }

      // Cuando el SW nuevo toma control, recargar la página una vez para que
      // el cliente trabaje contra el SW correcto (sin loop — guard por flag).
      let didReload = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (didReload) return;
        didReload = true;
        // No recargamos para no perder estado del usuario — solo logueamos.
        console.info("[sw-register] nuevo SW tomó control; próximas notis usan el handler nuevo");
      });

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
