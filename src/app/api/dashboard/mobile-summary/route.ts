import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/mobile-summary
 *
 * Endpoint LIVIANO para el dashboard mobile. Devuelve solo los KPIs que la pantalla
 * mobile muestra (4 KPIs + 5 facturas recientes) — no descarga toda la operación
 * del tenant como /api/dashboard/tenant-tables.
 *
 * Estructura de respuesta:
 *   {
 *     ventasMes: number,
 *     porCobrar: number,
 *     facturasPendientes: number,
 *     clientesActivos: number,
 *     stockCritico: number,
 *     facturasRecientes: { id, numero_factura, fecha, monto, estado, cliente_nombre? }[]
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const hoy = new Date();
    const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
    const finMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-31`;

    // 5 queries en paralelo, todas livianas y agregadas en SQL cuando se puede.
    const [facturasMesQ, facturasPendQ, clientesQ, productosQ, recientesQ] = await Promise.all([
      // Facturas del mes (para sumar ventas mes)
      supabase
        .from("facturas")
        .select("monto, saldo, estado")
        .eq("empresa_id", empresaId)
        .gte("fecha", inicioMes)
        .lte("fecha", finMes),
      // Facturas con saldo pendiente (para sumar por cobrar)
      supabase
        .from("facturas")
        .select("saldo, estado")
        .eq("empresa_id", empresaId)
        .gt("saldo", 0),
      // Clientes activos: count head
      supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId),
      // Productos con stock crítico
      supabase
        .from("productos")
        .select("stock_actual, stock_minimo")
        .eq("empresa_id", empresaId),
      // 5 facturas más recientes
      supabase
        .from("facturas")
        .select("id, numero_factura, fecha, monto, estado, cliente_id")
        .eq("empresa_id", empresaId)
        .order("fecha", { ascending: false })
        .limit(5),
    ]);

    const facturasMesRows = (facturasMesQ.data ?? []) as Array<{ monto: number; saldo: number; estado: string }>;
    const facturasPendRows = (facturasPendQ.data ?? []) as Array<{ saldo: number; estado: string }>;
    const productosRows = (productosQ.data ?? []) as Array<{ stock_actual: number; stock_minimo: number }>;
    const recientesRows = (recientesQ.data ?? []) as Array<{
      id: string;
      numero_factura: string;
      fecha: string;
      monto: number;
      estado: string;
      cliente_id: string | null;
    }>;

    // Ventas del mes: suma de monto neto de facturas no anuladas / no corregidas NC.
    const ventasMes = facturasMesRows
      .filter((f) => {
        const s = String(f.estado ?? "").toLowerCase().trim();
        return s !== "anulado" && s !== "corregida nc";
      })
      .reduce((acc, f) => acc + Number(f.monto ?? 0), 0);

    // Por cobrar: suma de saldo de facturas activas con saldo > 0.
    const facturasPendActivas = facturasPendRows.filter((f) => {
      const s = String(f.estado ?? "").toLowerCase().trim();
      return s !== "anulado" && s !== "corregida nc";
    });
    const porCobrar = facturasPendActivas.reduce((acc, f) => acc + Number(f.saldo ?? 0), 0);
    const facturasPendientes = facturasPendActivas.length;

    const clientesActivos = clientesQ.count ?? 0;

    const stockCritico = productosRows.filter(
      (p) => Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)
    ).length;

    // Enrich recientes con nombre de cliente (solo si hay clientes a buscar).
    const clienteIds = [...new Set(recientesRows.map((r) => r.cliente_id).filter((id): id is string => !!id))];
    let nombreByCliente = new Map<string, string>();
    if (clienteIds.length > 0) {
      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, empresa, nombre_contacto")
        .eq("empresa_id", empresaId)
        .in("id", clienteIds);
      for (const c of (clientes ?? []) as Array<{ id: string; empresa?: string; nombre_contacto?: string }>) {
        nombreByCliente.set(c.id, c.empresa?.trim() || c.nombre_contacto?.trim() || "");
      }
    }

    const facturasRecientes = recientesRows.map((f) => ({
      id: f.id,
      numero_factura: f.numero_factura,
      fecha: f.fecha,
      monto: f.monto,
      estado: f.estado,
      cliente_nombre: f.cliente_id ? nombreByCliente.get(f.cliente_id) ?? null : null,
    }));

    return NextResponse.json(
      successResponse({
        ventasMes,
        porCobrar,
        facturasPendientes,
        clientesActivos,
        stockCritico,
        facturasRecientes,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
