import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import { toCalendarDateStr } from "@/lib/fechas/calendario";
import { etiquetaVisibleTipoServicio } from "@/lib/clientes/tipo-servicio-catalogo";

type RowFacturaPago = { id?: string; numero_factura?: string | null; cliente_id?: string | null };
type RowClientePago = {
  id: string;
  empresa?: string | null;
  nombre_contacto?: string | null;
  tipo_servicio_cliente?: string | null;
};

/** Enmascara un email para logs/debug: ab…@dominio.com */
function maskEmail(email: string | undefined | null): string {
  const e = String(email ?? "");
  const at = e.indexOf("@");
  if (at <= 0) return e ? "(set)" : "(none)";
  return `${e.slice(0, 2)}…${e.slice(at)}`;
}

/**
 * `.in(col, ids)` batcheado. PostgREST va detrás de Cloudflare (api.neura.com.py):
 * un `.in()` con muchos UUID arma una URL enorme que CF rechaza con 502 → la query
 * caía entera y devolvía 0 filas (Cliente/Tipo en "—"). Batchear mantiene URLs
 * cortas y evita el corte del gateway.
 */
async function selectInBatches<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  col: string,
  ids: string[],
  batchSize = 25
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let error: string | null = null;
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const { data, error: err } = await supabase.from(table).select(columns).in(col, slice);
    if (err) {
      error = err.message;
      console.error(`[api/pagos] lookup ${table} (batch ${i / batchSize}):`, err.message);
      continue;
    }
    for (const r of (data as T[] | null | undefined) ?? []) rows.push(r);
  }
  return { rows, error };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const { searchParams } = new URL(request.url);
    const facturaId = searchParams.get("factura_id");
    const debug = searchParams.get("debug") === "1";

    // Factura via embed PostgREST (probado en esta instancia: la columna Factura
    // se resolvía correctamente con este patrón). El embed trae también `cliente_id`
    // para encadenar facturas.cliente_id -> clientes.id sin reconsultar.
    let query = supabase
      .from("pagos")
      .select("*, facturas(id, numero_factura, cliente_id)")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha_pago", { ascending: false });

    if (facturaId) {
      query = query.eq("factura_id", facturaId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    const pagos = (data ?? []) as Array<
      Record<string, unknown> & { usuario_id?: string; factura_id?: string; facturas?: unknown }
    >;

    // 1) Factura por pago desde el embed; con fallback batched a `facturas` para
    //    cualquier pago cuyo embed venga vacío (robustez ante schema/PostgREST).
    const facturaPorFacturaId: Record<string, RowFacturaPago> = {};
    const faltanFacturaIds: string[] = [];
    for (const p of pagos) {
      const emb = p.facturas as RowFacturaPago | RowFacturaPago[] | null;
      const f = Array.isArray(emb) ? emb[0] ?? null : emb;
      const fid = p.factura_id ? String(p.factura_id) : "";
      if (f && (f.numero_factura != null || f.cliente_id != null)) {
        if (fid) facturaPorFacturaId[fid] = f;
      } else if (fid) {
        faltanFacturaIds.push(fid);
      }
    }
    let facturasFallbackErr: string | null = null;
    const faltanUnicos = [...new Set(faltanFacturaIds)];
    if (faltanUnicos.length > 0) {
      const { rows: fData, error: fErr } = await selectInBatches<RowFacturaPago>(
        supabase,
        "facturas",
        "id, numero_factura, cliente_id",
        "id",
        faltanUnicos
      );
      facturasFallbackErr = fErr;
      for (const f of fData) {
        if (f?.id) facturaPorFacturaId[String(f.id)] = f;
      }
    }

    // 2) Resolver clientes por id. `select("*")` es tolerante a drift de columnas
    //    entre schemas (p. ej. `tipo_servicio_cliente` ausente): así nombre y tipo
    //    no se pierden juntos si una columna opcional no existe en el tenant.
    //    Antes era un select con columnas nombradas cuyo error se descartaba (causa
    //    real de Cliente/Tipo en "—").
    const clienteIds = [
      ...new Set(Object.values(facturaPorFacturaId).map((f) => f.cliente_id).filter(Boolean)),
    ] as string[];
    const clienteMap: Record<string, RowClientePago> = {};
    const catalogMap: Record<string, string> = {};
    let clientesErrMsg: string | null = null;
    if (clienteIds.length > 0) {
      const { rows: clientesData, error: clientesErr } = await selectInBatches<RowClientePago>(
        supabase,
        "clientes",
        "*",
        "id",
        clienteIds
      );
      clientesErrMsg = clientesErr;
      for (const c of clientesData) {
        if (c?.id) clienteMap[String(c.id)] = c;
      }
      const { data: catRows, error: catErr } = await supabase
        .from("cliente_tipos_servicio_catalogo")
        .select("slug, nombre")
        .eq("empresa_id", auth.empresa_id);
      if (catErr) {
        console.error("[api/pagos] lookup catálogo tipos:", catErr.message);
      }
      const cr = (catRows as { slug: string; nombre: string }[] | null | undefined) ?? [];
      for (const r of cr) {
        if (r?.slug && r.nombre) catalogMap[String(r.slug).toLowerCase()] = r.nombre;
      }
    }

    // 3) Email del usuario que registró el pago (schema `auth`, vía el mismo client).
    const usuarioIds = [...new Set(pagos.map((p) => p.usuario_id).filter(Boolean))] as string[];
    const usuarioMap: Record<string, string> = {};
    for (const uid of usuarioIds) {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(uid);
        usuarioMap[uid] = u?.user?.email ?? uid.slice(0, 8);
      } catch {
        usuarioMap[uid] = "—";
      }
    }

    const labelTipoCliente = (c: RowClientePago | null) => {
      if (!c) return "—";
      const raw = (c.tipo_servicio_cliente ?? "").trim();
      if (!raw) return "Sin clasificar";
      return etiquetaVisibleTipoServicio(raw, catalogMap);
    };

    const slugTipoCliente = (c: RowClientePago | null) => {
      if (!c) return null;
      const s = (c.tipo_servicio_cliente ?? "").trim();
      return s ? s.toLowerCase() : null;
    };

    const enriched = pagos.map((p) => {
      const fid = p.factura_id ? String(p.factura_id) : "";
      const factura = fid ? facturaPorFacturaId[fid] ?? null : null;
      const clienteId = factura?.cliente_id ? String(factura.cliente_id) : null;
      const cliente = clienteId ? clienteMap[clienteId] ?? null : null;
      return {
        ...p,
        factura_numero: factura?.numero_factura ?? "—",
        cliente_nombre: cliente ? (cliente.empresa ?? cliente.nombre_contacto ?? "—") : "—",
        /** Nombre legible; slug en `clientes.tipo_servicio_cliente` + catálogo. */
        cliente_tipo_nombre: labelTipoCliente(cliente),
        /** Slug normalizado para filtrar en UI sin reconsultar. */
        cliente_tipo_slug: slugTipoCliente(cliente),
        usuario_email: p.usuario_id ? usuarioMap[p.usuario_id] ?? "—" : "—",
      };
    });

    // Modo diagnóstico seguro (auth-gated): /api/pagos?debug=1 → contadores +
    // muestra sanitizada del primer pago serializado, sin datos sensibles completos.
    if (debug) {
      const pagosConEmbed = pagos.filter((p) => {
        const emb = p.facturas as RowFacturaPago | RowFacturaPago[] | null;
        const f = Array.isArray(emb) ? emb[0] ?? null : emb;
        return Boolean(f && (f.numero_factura != null || f.cliente_id != null));
      }).length;
      const s = enriched[0];
      const sample = s
        ? {
            factura_numero: s.factura_numero,
            cliente_nombre: s.cliente_nombre,
            cliente_tipo_nombre: s.cliente_tipo_nombre,
            cliente_tipo_slug: s.cliente_tipo_slug,
            monto: s.monto,
            fecha_pago: s.fecha_pago,
            metodo_pago: s.metodo_pago,
            factura_id_prefix: String(s.factura_id ?? "").slice(0, 8),
            usuario_email_masked: maskEmail(s.usuario_email as string),
            embed_factura_keys:
              s.facturas && typeof s.facturas === "object"
                ? Object.keys(s.facturas as Record<string, unknown>)
                : null,
          }
        : null;
      return NextResponse.json(
        successResponse({
          debug: {
            total_pagos: pagos.length,
            pagos_con_factura_id: pagos.filter((p) => p.factura_id).length,
            pagos_con_embed_factura: pagosConEmbed,
            facturas_fallback_consultadas: faltanUnicos.length,
            facturas_fallback_error: facturasFallbackErr,
            factura_ids_resueltos: Object.keys(facturaPorFacturaId).length,
            cliente_ids_unicos: clienteIds.length,
            clientes_encontrados: Object.keys(clienteMap).length,
            clientes_error: clientesErrMsg,
            catalogo_tipos: Object.keys(catalogMap).length,
          },
          sample,
        })
      );
    }

    return NextResponse.json(successResponse(enriched));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const body = await request.json();
    const { factura_id, monto, fecha_pago, metodo_pago, referencia } = body;

    if (!factura_id?.trim()) {
      return NextResponse.json(errorResponse("factura_id es obligatorio"), { status: 400 });
    }
    if (monto == null || Number(monto) <= 0) {
      return NextResponse.json(errorResponse("monto debe ser mayor a 0"), { status: 400 });
    }
    if (!fecha_pago) {
      return NextResponse.json(errorResponse("fecha_pago es obligatoria"), { status: 400 });
    }
    const fechaPagoNorm = toCalendarDateStr(String(fecha_pago));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPagoNorm)) {
      return NextResponse.json(errorResponse("fecha_pago inválida"), { status: 400 });
    }


    const { data: factura, error: errFactura } = await supabase
      .from("facturas")
      .select("id, monto, saldo, estado, cliente_id")
      .eq("id", factura_id)
      .eq("empresa_id", auth.empresa_id)
      .single();

    if (errFactura || !factura) {
      return NextResponse.json(errorResponse("Factura no encontrada"), { status: 404 });
    }

    const estadoFac = String(factura.estado ?? "");
    if (estadoFac === "Anulado") {
      return NextResponse.json(errorResponse("No se puede registrar pago sobre una factura anulada"), { status: 400 });
    }
    if (estadoFac === "Corregida NC") {
      return NextResponse.json(
        errorResponse("La factura fue liquidada con nota de crédito aprobada (SET); no admite cobros adicionales."),
        { status: 400 }
      );
    }
    if (estadoFac === "Pagado" && Number(factura.saldo) <= 0) {
      return NextResponse.json(errorResponse("La factura ya está pagada"), { status: 400 });
    }

    const saldoActual = Number(factura.saldo);
    const montoNum = Number(monto);
    if (montoNum > saldoActual) {
      return NextResponse.json(
        errorResponse("El monto del pago no puede superar el saldo pendiente de la factura"),
        { status: 400 }
      );
    }
    const nuevoSaldo = Math.max(0, saldoActual - montoNum);
    /** CHECK en BD solo admite Pagado | Pendiente | Vencido | Anulado — nunca "Parcial". */
    const nuevoEstado =
      nuevoSaldo <= 0 ? "Pagado" : estadoFac === "Vencido" ? "Vencido" : "Pendiente";

    const metodosValidos = ["efectivo", "transferencia", "cheque", "tarjeta", "otro"];
    const metodo = metodosValidos.includes(metodo_pago) ? metodo_pago : "efectivo";

    const insertData: Record<string, unknown> = {
      empresa_id: auth.empresa_id,
      factura_id: factura_id.trim(),
      monto: montoNum,
      fecha_pago: fechaPagoNorm,
      metodo_pago: metodo,
      referencia: referencia?.trim() || null,
      cliente_id: factura.cliente_id ?? null,
      usuario_id: auth.user?.id ?? null,
    };

    const { data, error } = await supabase
      .from("pagos")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    const { error: errUpdFactura } = await supabase
      .from("facturas")
      .update({ saldo: nuevoSaldo, estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq("id", factura_id.trim())
      .eq("empresa_id", auth.empresa_id);

    if (errUpdFactura) {
      await supabase.from("pagos").delete().eq("id", data.id);
      return NextResponse.json(
        errorResponse(
          `El pago no pudo aplicarse al saldo (${errUpdFactura.message}). Verifique el estado de la factura.`
        ),
        { status: 500 }
      );
    }

    console.log("[API] About to emit event");
    await emitEvent(EVENT_TYPES.pago_registrado, { pago_id: data.id, factura_id, monto: montoNum });

    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
