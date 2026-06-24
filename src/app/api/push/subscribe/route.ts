import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

/**
 * POST /api/push/subscribe
 *
 * Body:
 *   {
 *     endpoint: string,
 *     keys: { p256dh: string, auth: string },
 *     userAgent?: string
 *   }
 *
 * Upserta la suscripción Web Push (VAPID) del usuario actual en
 * `public.chat_push_subscriptions`. Si la misma `endpoint` ya existe (mismo
 * dispositivo), se actualiza la fila — evita duplicados al re-suscribirse.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; userAgent?: unknown }
      | null;

    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const authKey = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
    const userAgent = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 400) : null;

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { ok: false, error: "Suscripción inválida (faltan endpoint o keys)" },
        { status: 400 }
      );
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const usuarioId = auth.usuarioCatalogId ?? null;

    const { error } = await supabase
      .from("chat_push_subscriptions")
      .upsert(
        {
          empresa_id: auth.empresa_id,
          usuario_id: usuarioId,
          endpoint,
          p256dh,
          auth: authKey,
          user_agent: userAgent,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
