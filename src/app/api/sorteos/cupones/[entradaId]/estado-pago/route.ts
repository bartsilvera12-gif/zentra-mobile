import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { invalidateSorteosListCachesForEmpresa } from "@/lib/sorteos/server-queries";
import type { SorteoEntradaEstadoPago } from "@/lib/sorteos/types";

const LOG = "[sorteos-cupones][payment-status-update]";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

type Body = { estado_pago?: unknown };

/**
 * PATCH /api/sorteos/cupones/[entradaId]/estado-pago
 * Solo desde `pendiente_revision` → `confirmado` | `rechazado` (sin efectos colaterales en flujos).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entradaId: string }> }
) {
  let empresaIdForLog = "";
  let schemaForLog = "";

  try {
    const authCtx = await getTenantSupabaseFromAuth(request);
    if (!authCtx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const { entradaId: rawId } = await params;
    const entradaId = typeof rawId === "string" ? rawId.trim() : "";
    if (!entradaId || !isUuid(entradaId)) {
      return NextResponse.json(errorResponse("entradaId inválido."), { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const nextRaw = body.estado_pago;
    const next =
      nextRaw === "confirmado" || nextRaw === "rechazado"
        ? (nextRaw as SorteoEntradaEstadoPago)
        : null;
    if (!next) {
      return NextResponse.json(errorResponse('estado_pago debe ser "confirmado" o "rechazado".'), {
        status: 400,
      });
    }

    const empresaId = authCtx.auth.empresa_id;
    empresaIdForLog = empresaId;
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    schemaForLog = dataSchema;

    const sb = await getChatServiceClientForEmpresa(empresaId);

    const { data: row, error: selErr } = await sb
      .from("sorteo_entradas")
      .select("id, empresa_id, estado_pago")
      .eq("id", entradaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (selErr) {
      console.error(LOG, "select_error", { entrada_id: entradaId, empresa_id: empresaId, error: selErr.message });
      return NextResponse.json(errorResponse(selErr.message), { status: 500 });
    }

    if (!row || typeof row !== "object") {
      console.info(LOG, {
        entrada_id: entradaId,
        empresa_id: empresaId,
        schema: dataSchema,
        resultado: "not_found",
      });
      return NextResponse.json(errorResponse("Entrada no encontrada."), { status: 404 });
    }

    const estadoAnt = String((row as { estado_pago?: unknown }).estado_pago ?? "").trim();
    if (estadoAnt !== "pendiente_revision") {
      console.info(LOG, {
        entrada_id: entradaId,
        empresa_id: empresaId,
        schema: dataSchema,
        estado_anterior: estadoAnt,
        estado_solicitado: next,
        resultado: "reject_wrong_state",
      });
      return NextResponse.json(
        errorResponse(
          estadoAnt === "confirmado" || estadoAnt === "rechazado"
            ? "Este pago ya fue resuelto."
            : `Solo se puede aprobar o rechazar desde «Pendiente revisión». Estado actual: ${estadoAnt}.`
        ),
        { status: 409 }
      );
    }

    const updatedAt = new Date().toISOString();
    const { data: updated, error: upErr } = await sb
      .from("sorteo_entradas")
      .update({ estado_pago: next, updated_at: updatedAt })
      .eq("id", entradaId)
      .eq("empresa_id", empresaId)
      .eq("estado_pago", "pendiente_revision")
      .select("id, estado_pago")
      .maybeSingle();

    if (upErr) {
      console.error(LOG, "update_error", {
        entrada_id: entradaId,
        empresa_id: empresaId,
        schema: dataSchema,
        estado_anterior: estadoAnt,
        estado_nuevo: next,
        resultado: "error",
        message: upErr.message,
      });
      return NextResponse.json(errorResponse(upErr.message), { status: 500 });
    }

    if (!updated || typeof updated !== "object") {
      console.info(LOG, {
        entrada_id: entradaId,
        empresa_id: empresaId,
        schema: dataSchema,
        estado_anterior: estadoAnt,
        estado_nuevo: next,
        resultado: "concurrent_skip",
      });
      return NextResponse.json(errorResponse("El estado cambió mientras procesábamos; actualizá la lista."), {
        status: 409,
      });
    }

    invalidateSorteosListCachesForEmpresa(empresaId, dataSchema);

    console.info(LOG, {
      entrada_id: entradaId,
      empresa_id: empresaId,
      schema: dataSchema,
      estado_anterior: estadoAnt,
      estado_nuevo: next,
      resultado: "ok",
    });

    return NextResponse.json(
      successResponse({
        entrada_id: entradaId,
        estado_pago: next as SorteoEntradaEstadoPago,
      })
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, {
      empresa_id: empresaIdForLog || undefined,
      schema: schemaForLog || undefined,
      resultado: "exception",
      message: msg.slice(0, 300),
    });
    return NextResponse.json(errorResponse(msg || "Error interno."), { status: 503 });
  }
}
