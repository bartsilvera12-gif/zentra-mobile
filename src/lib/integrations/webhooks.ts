/**
 * Sistema de Webhooks para integraciones externas (n8n, Zapier, etc.).
 * Envía POST a WEBHOOK_URL cuando se emiten eventos.
 */

import type { EventType } from "./events";

/**
 * Envía un webhook HTTP POST con el evento y payload.
 * Requiere WEBHOOK_URL en variables de entorno.
 */
export async function sendWebhook(event: EventType, payload: Record<string, unknown>): Promise<void> {
  try {
    const url = process.env.WEBHOOK_URL;

    if (!url) {
      console.warn("[Webhook] WEBHOOK_URL not configured");
      return;
    }

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event,
        payload,
        source: "neura_erp",
      }),
    });
  } catch (error) {
    console.error("[Webhook] Error:", error);
  }
}
