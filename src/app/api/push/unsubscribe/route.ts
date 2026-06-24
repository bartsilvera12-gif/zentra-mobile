import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint: string }
 *
 * Borra la suscripción Web Push del dispositivo (cuando el usuario revoca el
 * permiso o desinstala la PWA). El backend también borra automáticamente las
 * suscripciones que retornan 404/410 al disparar push.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) {
      return NextResponse.json({ ok: false, error: "endpoint requerido" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const { error } = await supabase
      .from("chat_push_subscriptions")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("endpoint", endpoint);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
