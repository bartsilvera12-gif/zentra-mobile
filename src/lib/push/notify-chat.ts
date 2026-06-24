import "server-only";
import { getPushDbClient } from "./push-db-client";
import { sendPushFanout, isPushEnabled, type PushSubscriptionRecord } from "./web-push-server";

/**
 * Dispara un Web Push a todos los dispositivos suscriptos del empresa cuando
 * llega un mensaje inbound. Fire-and-forget desde el caller — esta función
 * nunca debe romper el flujo del webhook.
 *
 * Si VAPID no está configurado (env vars ausentes) directamente no-op.
 *
 * Borra del backend las suscripciones que respondieron 404/410 para no
 * insistir con endpoints muertos.
 */
export async function notifyChatPushSubscribers(opts: {
  empresaId: string;
  conversationId: string;
  contactName: string;
  preview: string;
}): Promise<void> {
  try {
    if (!isPushEnabled()) return;
    const supabase = getPushDbClient();

    const { data, error } = await supabase
      .from("chat_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("empresa_id", opts.empresaId);
    if (error || !data || data.length === 0) return;

    const subs = data as PushSubscriptionRecord[];
    const { delivered, expired } = await sendPushFanout(subs, {
      title: opts.contactName,
      body: opts.preview || "Nuevo mensaje",
      conversationId: opts.conversationId,
      tag: `chat-${opts.conversationId}`,
      url: `/dashboard/conversaciones?id=${encodeURIComponent(opts.conversationId)}`,
    });

    if (expired.length > 0) {
      try {
        await supabase
          .from("chat_push_subscriptions")
          .delete()
          .in("id", expired);
      } catch { /* silencioso */ }
    }
    console.info("[push] fanout", {
      empresa: opts.empresaId,
      conversation: opts.conversationId,
      subs: subs.length,
      delivered,
      expired: expired.length,
    });
  } catch (e) {
    console.warn("[push] notifyChatPushSubscribers failed:", e);
  }
}
