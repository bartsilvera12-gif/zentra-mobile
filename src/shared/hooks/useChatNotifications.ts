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
        } as NotificationOptions);
      } else {
        const n = new Notification(nombre, {
          body,
          tag,
          icon: "/icon.png",
          data,
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
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Devuelve el estado actual (granted / denied / default). */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Beep corto (WebAudio, sin archivos). Best-effort. */
function playBeep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* navegadores con autoplay policy estricta lo bloquean — ignorar */
  }
}
