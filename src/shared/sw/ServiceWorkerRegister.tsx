"use client";

import { useEffect } from "react";

/**
 * Registra `/sw.js` apenas el cliente arranca. Tolerante a fallos: si el browser
 * no soporta service workers (Safari viejo) simplemente no hace nada y la app
 * sigue funcionando — el hook de notificaciones cae a `new Notification(...)`.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Esperar al window.load para no competir con el primer paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* ignorar — la app funciona sin SW (solo no hay push background). */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
