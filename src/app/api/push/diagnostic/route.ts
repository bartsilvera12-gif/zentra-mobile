import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { isPushEnabled } from "@/lib/push/web-push-server";

/**
 * GET /api/push/diagnostic
 *
 * Devuelve el estado del setup de Web Push background. Sirve para que el
 * operador verifique en 2 segundos qué falta sin tener que entrar a Coolify
 * ni a Supabase. Pegale desde el navegador estando logueado y vas a ver un
 * JSON tipo:
 *
 *   {
 *     "webPushReady": true,
 *     "env": {
 *       "NEXT_PUBLIC_VAPID_PUBLIC_KEY": true,
 *       "VAPID_PRIVATE_KEY": true,
 *       "VAPID_SUBJECT": "mailto:..."
 *     },
 *     "db": { "tableExists": true, "subscriptionsForEmpresa": 3 },
 *     "ready": true,
 *     "missing": []
 *   }
 *
 * Si `ready: false`, el array `missing` enumera exactamente qué hace falta.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth?.empresa_id) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const env = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? null,
  };

  let tableExists = false;
  let subscriptionsForEmpresa = 0;
  let dbError: string | null = null;
  try {
    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const { count, error } = await supabase
      .from("chat_push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", auth.empresa_id);
    if (error) {
      dbError = error.message;
      tableExists = !/does not exist|relation .* does not exist/i.test(error.message);
    } else {
      tableExists = true;
      subscriptionsForEmpresa = count ?? 0;
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const webPushReady = isPushEnabled();

  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) missing.push("env NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!env.VAPID_PRIVATE_KEY) missing.push("env VAPID_PRIVATE_KEY");
  if (!env.VAPID_SUBJECT) missing.push("env VAPID_SUBJECT");
  if (!tableExists) missing.push("migración chat_push_subscriptions sin aplicar");
  if (!webPushReady) missing.push("web-push no inicializado (verificar env vars + redeploy)");
  if (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && tableExists && subscriptionsForEmpresa === 0) {
    missing.push(
      "ningún dispositivo suscripto todavía — tocá la campana del header del inbox para suscribir este dispositivo"
    );
  }

  const ready = missing.length === 0;

  return NextResponse.json(
    {
      webPushReady,
      env,
      db: { tableExists, subscriptionsForEmpresa, error: dbError },
      ready,
      missing,
    },
    { status: 200 }
  );
}
