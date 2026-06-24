import { NextRequest, NextResponse } from "next/server";
import { markConversationRead } from "@/lib/chat/actions";

/**
 * POST /api/chat/mark-read
 * Body: { conversation_id: string }
 *
 * Pone `unread_count = 0` en la conversación. Pensado para el cliente mobile,
 * que llama este endpoint apenas el usuario entra al chat — además del
 * update optimista local para limpiar el badge inmediatamente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { conversation_id?: unknown }
      | null;
    const conversationId =
      body && typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id requerido" }, { status: 400 });
    }
    await markConversationRead(conversationId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    // Si la sesión expiró o no hay empresa contextual, devolvemos 401 explícito.
    const status = /no auten|empresa|tenant|forbidden/i.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
