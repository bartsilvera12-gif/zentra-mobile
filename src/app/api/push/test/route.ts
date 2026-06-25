import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getPushDbClient } from "@/lib/push/push-db-client";
import { isPushEnabled, sendPushFanout, type PushSubscriptionRecord } from "@/lib/push/web-push-server";

/**
 * POST /api/push/test
 *
 * Dispara un push de prueba a todas las suscripciones de la empresa actual.
 * Útil para destrabar el flujo sin esperar a que llegue un WhatsApp real: si
 * este endpoint hace llegar la noti al cel, todo el stack (VAPID + DB +
 * web-push + SW del cliente) anda. Si no llega, el problema está antes del
 * webhook (cliente SW, FCM, etc.).
 *
 * Devuelve cuántas subs encontró, cuántas entregó OK y cuántas estaban
 * expiradas (borradas automáticamente).
 *
 * Body opcional: { body?: string } para personalizar el cuerpo del push.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth?.empresa_id) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  if (!isPushEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Web Push no habilitado: faltan VAPID env vars (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) o el modulo no inicializo. Pegale a /api/push/diagnostic.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const text = typeof body.body === "string" && body.body.trim() ? body.body.trim() : "Esto es una prueba — si lees esto, el push background funciona.";

  const supabase = getPushDbClient();
  const { data, error } = await supabase
    .from("chat_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("empresa_id", auth.empresa_id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const subs = (data ?? []) as PushSubscriptionRecord[];
  if (subs.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No hay suscripciones para tu empresa. Tocá la 🔔 del header desde el dispositivo donde queres recibir notis y aceptá el permiso.",
      },
      { status: 404 }
    );
  }

  const { delivered, expired } = await sendPushFanout(subs, {
    title: "Zentra Chat — Test de notificación",
    body: text,
    url: "/dashboard/conversaciones",
    tag: "push-test",
  });

  if (expired.length > 0) {
    try {
      await supabase.from("chat_push_subscriptions").delete().in("id", expired);
    } catch { /* ignorar */ }
  }

  return NextResponse.json({
    ok: true,
    found: subs.length,
    delivered,
    expired: expired.length,
    endpoints: subs.map((s) => s.endpoint.slice(0, 80) + "..."),
  });
}
