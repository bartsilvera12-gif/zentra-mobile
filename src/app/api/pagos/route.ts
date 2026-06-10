import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import { toCalendarDateStr } from "@/lib/fechas/calendario";
import { etiquetaVisibleTipoServicio } from "@/lib/clientes/tipo-servicio-catalogo";


export async function GET(request: NextRequest) {
  try {
    // Mismo acceso multi-schema que /api/facturas y /api/clientes: tenants `erp_*`
    // (no expuestos en PostgREST) se resuelven vía shim Postgres directo; legado
    // `zentra_erp` sigue por PostgREST. Antes esta ruta usaba PostgREST plano +
    // embed `facturas(...)`, que en tenants `erp_*` rompía el enriquecido de cliente.
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const { searchParams } = new URL(request.url);
    const facturaId = searchParams.get("factura_id");

    let query = supabase
      .from("pagos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha_pago", { ascending: false });

    if (facturaId) {
      query = query.eq("factura_id", facturaId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    const pagos = (data ?? []) as Array<Record<string, unknown> & { usuario_id?: string; factura_id?: string }>;

    // 1) Resolver facturas por id (sin embed: el shim PG no soporta embeds PostgREST).
    type RowFacturaPago = { id: string; numero_factura?: string; cliente_id?: string | null };
    const facturaIds = [...new Set(pagos.map((p) => p.factura_id).filter(Boolean))] as string[];
    const facturaMap: Record<string, RowFacturaPago> = {};
    if (facturaIds.length > 0) {
      const { data: facturasData, error: facturasErr } = await supabase
        .from("facturas")
        .select("id, numero_factura, cliente_id")
        .in("id", facturaIds);
      if (facturasErr) {
        console.error("[api/pagos] lookup facturas:", facturasErr.message);
      }
      for (const f of (facturasData as RowFacturaPago[] | null | undefined) ?? []) {
        if (f?.id) facturaMap[f.id] = f;
      }
    }

    // 2) Resolver clientes por id. `select("*")` es tolerante a drift de columnas
    //    entre schemas tenant (p. ej. `tipo_servicio_cliente` ausente): así nombre y
    //    tipo no se pierden juntos si una columna opcional no existe en el tenant.
    type RowClientePago = {
      id: string;
      empresa?: string | null;
      nombre_contacto?: string | null;
      tipo_servicio_cliente?: string | null;
    };
    const clienteIds = [
      ...new Set(Object.values(facturaMap).map((f) => f.cliente_id).filter(Boolean)),
    ] as string[];
    const clienteMap: Record<string, RowClientePago> = {};
    const catalogMap: Record<string, string> = {};
    if (clienteIds.length > 0) {
      const { data: clientesData, error: clientesErr } = await supabase
        .from("clientes")
        .select("*")
        .in("id", clienteIds);
      if (clientesErr) {
        console.error("[api/pagos] lookup clientes:", clientesErr.message);
      }
      for (const c of (clientesData as RowClientePago[] | null | undefined) ?? []) {
        if (c?.id) clienteMap[c.id] = c;
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

    // 3) Email del usuario que registró el pago. El shim PG no expone `.auth`;
    //    el schema `auth` es global, accesible con el service role estándar.
    const usuarioIds = [...new Set(pagos.map((p) => p.usuario_id).filter(Boolean))] as string[];
    const usuarioMap: Record<string, string> = {};
    if (usuarioIds.length > 0) {
      const admin = createServiceRoleClient();
      for (const uid of usuarioIds) {
        try {
          const { data: u } = await admin.auth.admin.getUserById(uid);
          usuarioMap[uid] = u?.user?.email ?? uid.slice(0, 8);
        } catch {
          usuarioMap[uid] = "—";
        }
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
      const factura = p.factura_id ? facturaMap[p.factura_id] ?? null : null;
      const clienteId = factura?.cliente_id;
      const cliente = clienteId ? clienteMap[clienteId] : null;
      return {
        ...p,
        factura_numero: factura?.numero_factura ?? "—",
        cliente_nombre: cliente ? (cliente.empresa ?? cliente.nombre_contacto ?? "—") : "—",
        /** Nombre legible; slug en `clientes.tipo_servicio_cliente` + catálogo. */
        cliente_tipo_nombre: labelTipoCliente(cliente ?? null),
        /** Slug normalizado para filtrar en UI sin reconsultar. */
        cliente_tipo_slug: slugTipoCliente(cliente ?? null),
        usuario_email: p.usuario_id ? usuarioMap[p.usuario_id] ?? "—" : "—",
      };
    });

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
