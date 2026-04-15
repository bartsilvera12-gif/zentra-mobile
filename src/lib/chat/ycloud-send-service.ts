import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import type { SendWhatsAppTextResult } from "@/lib/chat/whatsapp-send-service";

/** Endpoint enqueue según OpenAPI oficial YCloud (`POST /v2/whatsapp/messages`). */
const YCLOUD_WHATSAPP_MESSAGES_URL = "https://api.ycloud.com/v2/whatsapp/messages";

function digitsToE164(digits: string): string | null {
  const d = normalizeWaPhone(digits);
  if (!d) return null;
  return `+${d}`;
}

/**
 * Envía texto por WhatsApp usando la API REST de YCloud (no Meta Graph).
 * Autenticación: header `X-API-Key` (esquema documentado en OpenAPI).
 */
export async function sendMessageViaYCloud(params: {
  apiKey: string;
  /** Número de negocio en E.164 (p. ej. +54911…), desde config.ycloud_sender_id */
  fromE164: string;
  /** Solo dígitos del cliente (mismo formato que usa Meta en el ERP) */
  toDigits: string;
  text: string;
}): Promise<SendWhatsAppTextResult> {
  const toE164 = digitsToE164(params.toDigits);
  if (!toE164) {
    return { ok: false, error: "Teléfono de destino inválido para YCloud" };
  }

  const res = await fetch(YCLOUD_WHATSAPP_MESSAGES_URL, {
    method: "POST",
    headers: {
      "X-API-Key": params.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromE164,
      to: toE164,
      type: "text",
      text: { body: params.text },
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = raw.error as Record<string, unknown> | undefined;
    const msg =
      (typeof errObj?.message === "string" && errObj.message) ||
      (typeof raw.message === "string" && raw.message) ||
      res.statusText;
    console.warn("[ycloud-send] request_failed", { status: res.status, raw });
    return {
      ok: false,
      error: msg || `HTTP ${res.status}`,
      status: res.status,
      raw,
    };
  }

  const wamid = typeof raw.wamid === "string" ? raw.wamid : null;
  const id = typeof raw.id === "string" ? raw.id : null;
  const waMessageId = wamid || id;
  console.info("[ycloud-send] accepted", { waMessageId, status: res.status });
  return { ok: true, waMessageId, raw };
}

export function ycloudSenderToE164(senderId: string): string | null {
  return digitsToE164(senderId);
}
