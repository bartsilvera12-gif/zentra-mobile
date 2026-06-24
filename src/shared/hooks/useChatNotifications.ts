"use client";

import { useEffect, useRef } from "react";
import type { MobileChatConversation } from "@/shared/hooks/useChatMobile";

/**
 * Dispara `Notification` cuando el polling del inbox detecta mensajes nuevos.
 *
 *   - Necesita permiso del usuario (pedir antes con `requestNotificationPermission`).
 *   - Foreground (tab activo en el mismo chat): no notifica para no molestar.
 *   - Foreground en otro chat / app sin foco / tab en background: notifica.
 *   - Background (app cerrada): requiere Service Worker + Web Push real (registrado
 *     aparte). Esta capa cubre solo el caso de tab abierto.
 *
 * Identifica "nuevo mensaje" comparando:
 *   - conversaciones nuevas que no estaban en el snapshot anterior, o
 *   - aumento de `unread_count` respecto al snapshot anterior.
 *
 * Hace un beep corto opcional. Se puede silenciar con `silent: true` o mediante
 * preferencia del usuario (no expuesta en UI todavía).
 */
export function useChatNotifications(opts: {
  conversations: MobileChatConversation[];
  /** Id del chat actualmente abierto (no notifica para este chat). */
  activeConversationId: string | null;
  /** Permite desactivar el sonido. Default false. */
  silent?: boolean;
}) {
  const { conversations, activeConversationId, silent } = opts;
  const prevRef = useRef<Map<string, number> | null>(null);
  const firstRunRef = useRef(true);

  useEffect(() => {
    const curr = new Map<string, number>();
    for (const c of conversations) curr.set(c.id, c.unread_count ?? 0);

    // Primera pasada: no notificar, solo memorizar.
    if (firstRunRef.current) {
      prevRef.current = curr;
      firstRunRef.current = false;
      return;
    }

    const prev = prevRef.current ?? new Map<string, number>();
    const nuevos: MobileChatConversation[] = [];
    for (const c of conversations) {
      const before = prev.get(c.id) ?? 0;
      const after = c.unread_count ?? 0;
      const isNewConv = !prev.has(c.id) && after > 0;
      if (isNewConv || after > before) {
        // Suprimir si es el chat que el usuario está mirando con foco.
        if (
          activeConversationId === c.id &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          document.hasFocus()
        ) {
          continue;
        }
        nuevos.push(c);
      }
    }
    prevRef.current = curr;

    if (nuevos.length === 0) return;
    void notifyMany(nuevos, { silent: !!silent });
  }, [conversations, activeConversationId, silent]);
}

async function notifyMany(
  list: MobileChatConversation[],
  { silent }: { silent: boolean }
) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Si están registrados Service Workers, preferimos `showNotification` del SW
  // — permite agrupar y persistir aunque el tab se cierre justo después.
  let swReg: ServiceWorkerRegistration | null = null;
  try {
    if ("serviceWorker" in navigator) {
      swReg = (await navigator.serviceWorker.getRegistration()) ?? null;
    }
  } catch {
    swReg = null;
  }

  // Beep corto la primera vez del lote (no uno por cada uno).
  if (!silent) playBeep();

  for (const c of list) {
    const nombre =
      c.contact_nombre?.trim() || c.contact_telefono?.trim() || "Nuevo mensaje";
    const body = c.last_message_preview ?? "Tenés un mensaje nuevo";
    const tag = `chat-${c.id}`; // Reemplaza notificación previa del mismo chat.
    const data = { conversationId: c.id, url: `/dashboard/conversaciones?id=${encodeURIComponent(c.id)}` };
    try {
      if (swReg) {
        await swReg.showNotification(nombre, {
          body,
          tag,
          icon: "/icon.png",
          badge: "/icon.png",
          data,
          silent: false,
          renotify: true,
          // Vibración (Android). Si está en silencio igual vibra (salvo No Molestar).
          vibrate: [120, 40, 60, 40, 60],
        } as NotificationOptions);
      } else {
        const n = new Notification(nombre, {
          body,
          tag,
          icon: "/icon.png",
          data,
          silent: false,
        });
        n.onclick = () => {
          window.focus();
          window.location.href = data.url;
          n.close();
        };
      }
    } catch {
      // Silenciar fallos individuales (permisos cambiaron, etc.).
    }
  }
}

/** Pide permiso para notificar. Devuelve el estado final. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    if (Notification.permission === "granted") void ensurePushSubscription();
    return Notification.permission;
  }
  try {
    const p = await Notification.requestPermission();
    if (p === "granted") void ensurePushSubscription();
    return p;
  } catch {
    return "denied";
  }
}

/**
 * Si hay permiso + SW + VAPID public key en env, suscribe al Push Manager y
 * envía la suscripción serializada al backend (/api/push/subscribe) para que
 * el webhook pueda dispararle pushes cuando llegue un mensaje, incluso con la
 * app cerrada.
 *
 * Idempotente: si ya hay una suscripción activa, igual la reenvía al backend
 * (por si la fila se borró por inactividad). Silenciosa ante errores — la app
 * sigue funcionando con foreground notifications.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // El tipo `BufferSource` del DOM excluye `Uint8Array<ArrayBufferLike>` en
      // TS 5.5+; .buffer es ArrayBuffer y satisface el contrato.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
      });
    }
    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  } catch {
    /* silencioso — el caller no necesita saber */
  }
}

/** VAPID public key viene en base64-url; el PushManager exige Uint8Array. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Devuelve el estado actual (granted / denied / default). */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Sonido de notificación corto (~450ms). Tres notas en arpegio descendente
 * (Sol5 → Mi5 → Do5) con envolvente suave para que suene a "ding" agradable y
 * no a beep crudo. Best-effort: si el navegador bloquea autoplay (sin gesto
 * previo del usuario) simplemente no suena, sin error.
 */
function playBeep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Acordes G5 (783.99) – E5 (659.25) – C5 (523.25) — tríada de C major
    // descendente, lectura "campanita".
    const notes = [
      { freq: 783.99, start: 0.0, dur: 0.18 },
      { freq: 659.25, start: 0.09, dur: 0.18 },
      { freq: 523.25, start: 0.20, dur: 0.30 },
    ];
    const master = ctx.createGain();
    master.gain.value = 0.22; // volumen general — discreto pero audible
    master.connect(ctx.destination);
    let endsAt = 0;
    notes.forEach((n) => {
      const t0 = ctx.currentTime + n.start;
      const t1 = t0 + n.dur;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, t0);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(1.0, t0 + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(env);
      env.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
      endsAt = Math.max(endsAt, t1 + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), Math.ceil(endsAt * 1000) + 50);
  } catch {
    /* navegadores con autoplay policy estricta lo bloquean — ignorar */
  }
}
