import "server-only";
import webpush from "web-push";

/**
 * Configuración de Web Push usando claves VAPID.
 *
 * Generar las claves una sola vez:
 *   npx web-push generate-vapid-keys
 *
 * Y setear en env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...  (pública — la usa el cliente al suscribir)
 *   VAPID_PRIVATE_KEY=...             (privada — solo backend)
 *   VAPID_SUBJECT=mailto:soporte@zentra.neura.com.py
 *
 * Sin estas env vars el módulo NO rompe, simplemente isPushEnabled() devuelve
 * false y los disparos de push son no-op (logueados a la consola).
 */
let initialized = false;
let enabled = false;

function ensureInit(): boolean {
  if (initialized) return enabled;
  initialized = true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT ?? "mailto:soporte@zentra.neura.com.py";
  if (!pub || !priv) {
    console.warn("[push] VAPID keys ausentes — Web Push deshabilitado.");
    enabled = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subj, pub, priv);
    enabled = true;
    return true;
  } catch (e) {
    console.warn("[push] No se pudieron configurar VAPID:", e);
    enabled = false;
    return false;
  }
}

export function isPushEnabled(): boolean {
  return ensureInit();
}

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  conversationId?: string;
  url?: string;
  tag?: string;
};

/**
 * Envía un push a una suscripción. Retorna `{ ok, gone }` — `gone=true`
 * cuando el endpoint devolvió 404/410 (suscripción expirada), señal para
 * que el caller borre el registro de la DB.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ ok: boolean; gone: boolean; status?: number; error?: string }> {
  if (!ensureInit()) return { ok: false, gone: false, error: "push-disabled" };
  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 } // 24h
    );
    return { ok: true, gone: false, status: res.statusCode };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string } & Error;
    const status = err.statusCode;
    const gone = status === 404 || status === 410;
    return { ok: false, gone, status, error: err.message ?? String(e) };
  }
}

/** Envía el mismo payload a muchas subs. Fire-and-forget friendly. */
export async function sendPushFanout(
  subs: PushSubscriptionRecord[],
  payload: PushPayload
): Promise<{ delivered: number; expired: string[] }> {
  if (subs.length === 0) return { delivered: 0, expired: [] };
  const results = await Promise.allSettled(subs.map((s) => sendPush(s, payload)));
  let delivered = 0;
  const expired: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.ok) delivered++;
      else if (r.value.gone) expired.push(subs[i].id);
    }
  });
  return { delivered, expired };
}
