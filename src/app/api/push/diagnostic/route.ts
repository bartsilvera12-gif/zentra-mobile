import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getPushDbClient } from "@/lib/push/push-db-client";
import { isPushEnabled } from "@/lib/push/web-push-server";

/**
 * GET /api/push/diagnostic
 *
 * Diagnóstico del setup de Web Push. La parte "global" (env vars cargadas,
 * tabla existe, total de subs) funciona sin auth — info no sensible que
 * permite verificar el setup de Coolify/Supabase en 5 segundos desde cualquier
 * cliente. Si además hay sesión Supabase válida, agrega el conteo de subs
 * para esa empresa puntual.
 */
export async function GET(request: NextRequest) {
  const env = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? null,
  };
  const webPushReady = isPushEnabled();

  // Si están las VAPID públicas, exponemos los primeros 12 chars para que el
  // operador pueda comparar contra la que tiene en Coolify / contra la que el
  // cliente está usando.
  const vapidPublicHint = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.slice(0, 12) ?? null;

  let tableExists = false;
  let subscriptionsTotal = 0;
  let dbError: string | null = null;
  const supabase = getPushDbClient();
  try {
    const { count, error } = await supabase
      .from("chat_push_subscriptions")
      .select("*", { count: "exact", head: true });
    if (error) {
      dbError = error.message;
      tableExists = !/does not exist|relation .* does not exist/i.test(error.message);
    } else {
      tableExists = true;
      subscriptionsTotal = count ?? 0;
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  // Bonus si hay sesión: detalle de la empresa actual.
  let empresa: null | {
    id: string;
    subscriptions: number;
  } = null;
  let authNote: string | null = "no autenticado — pegale al URL desde una pestaña logueada para ver subs de tu empresa";
  try {
    const auth = await getAuthWithRol(request);
    if (auth?.empresa_id) {
      authNote = null;
      const { count } = await supabase
        .from("chat_push_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", auth.empresa_id);
      empresa = { id: auth.empresa_id, subscriptions: count ?? 0 };
    }
  } catch {
    /* ignorar — el diagnóstico funciona sin auth */
  }

  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) missing.push("env NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!env.VAPID_PRIVATE_KEY) missing.push("env VAPID_PRIVATE_KEY");
  if (!env.VAPID_SUBJECT) missing.push("env VAPID_SUBJECT");
  if (!tableExists) missing.push("tabla public.chat_push_subscriptions inexistente (correr migración)");
  if (!webPushReady) missing.push("web-push no inicializado (verificar VAPID + redeploy)");
  if (
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    tableExists &&
    subscriptionsTotal === 0
  ) {
    missing.push("ningún dispositivo suscripto en toda la app — tocá la 🔔 del header y aceptá el permiso");
  }
  if (
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    tableExists &&
    subscriptionsTotal > 0 &&
    empresa &&
    empresa.subscriptions === 0
  ) {
    missing.push(
      `hay ${subscriptionsTotal} subs en total pero ninguna para tu empresa (${empresa.id}) — desde este cel, tocá la 🔔 y aceptá`
    );
  }

  const ready = missing.length === 0 && tableExists && webPushReady;

  return NextResponse.json(
    {
      webPushReady,
      env,
      vapidPublicHint,
      db: { tableExists, subscriptionsTotal, error: dbError },
      empresa,
      authNote,
      ready,
      missing,
      now: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
