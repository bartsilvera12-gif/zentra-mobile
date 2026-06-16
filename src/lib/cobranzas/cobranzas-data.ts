import "server-only";
import type { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";

type Sb = Awaited<ReturnType<typeof getChatServiceClientForEmpresa>>;

const PAGE = 800;
const ESTADOS_NO_DEUDA = new Set(["pagado", "anulado", "corregida nc"]);

export type TramoKey = "al_dia" | "tramo_1" | "tramo_2" | "tramo_3";

export type ClienteCobranza = {
  cliente_id: string;
  cliente_label: string;
  tipo: string; // SaaS / Contable / Sin clasificar / Otro
  plan: string | null;
  monto_mensual: number | null;
  total_adeudado: number;
  cuotas_vencidas: number;
  meses_adeudados: string[]; // ['2026-04', ...]
  tramo: TramoKey;
  ultimo_pago: string | null;
  proximo_vencimiento: string | null;
};

export type CobranzasResumen = {
  total_adeudado: number;
  clientes_con_deuda: number;
  cuotas_vencidas_total: number;
  por_tramo: { al_dia: number; tramo_1: number; tramo_2: number; tramo_3: number };
};

export type FacturaLite = {
  id: string;
  numero_factura: string | null;
  fecha: string | null;
  fecha_vencimiento: string | null;
  monto: number;
  saldo: number;
  estado: string | null;
  tipo: string | null;
  vencida: boolean;
};

export type PagoLite = { factura_id: string; numero_factura: string | null; fecha_pago: string | null; monto: number; metodo_pago: string | null };

export type DetalleCobranza = {
  cliente: {
    cliente_id: string;
    cliente_label: string;
    tipo: string;
    plan: string | null;
    monto_mensual: number | null;
    alta: string | null;
  };
  total_deuda: number;
  cuotas_vencidas: number;
  tramo: TramoKey;
  meses_adeudados: string[];
  facturas_pendientes: FacturaLite[];
  facturas_vencidas: FacturaLite[];
  pagos_recientes: PagoLite[];
};

export function tramoDe(cuotasVencidas: number): TramoKey {
  if (cuotasVencidas <= 0) return "al_dia";
  if (cuotasVencidas === 1) return "tramo_1";
  if (cuotasVencidas === 2) return "tramo_2";
  return "tramo_3";
}

/** Hoy en America/Asuncion como YYYY-MM-DD. */
export function hoyAsuncionYmd(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // en-CA → YYYY-MM-DD
}

function ymd(s: string | null | undefined): string {
  return s ? String(s).slice(0, 10) : "";
}

function esDeuda(estado: string | null | undefined): boolean {
  return !ESTADOS_NO_DEUDA.has(String(estado ?? "").trim().toLowerCase());
}

function tipoClienteLabel(slug: string | null | undefined): string {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return "Sin clasificar";
  if (s === "saas") return "SaaS";
  if (s === "otro") return "Contable";
  return "Otro";
}

async function fetchAll(
  sb: Sb,
  table: string,
  columns: string,
  empresaId: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .eq("empresa_id", empresaId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const chunk = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

/** Mapa cliente_id → { plan_nombre, precio } de la suscripción activa (si hay varias, la primera activa). */
async function cargarSuscripcionPorCliente(
  sb: Sb,
  empresaId: string
): Promise<Map<string, { plan: string | null; precio: number | null }>> {
  const subs = await fetchAll(sb, "suscripciones", "cliente_id, plan_id, precio, estado", empresaId);
  const planIds = [...new Set(subs.map((s) => String(s.plan_id ?? "")).filter(Boolean))];
  const planNombre = new Map<string, string>();
  for (let i = 0; i < planIds.length; i += 120) {
    const slice = planIds.slice(i, i + 120);
    const { data } = await sb.from("planes").select("id, nombre").in("id", slice);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      planNombre.set(String(p.id), String(p.nombre ?? ""));
    }
  }
  const map = new Map<string, { plan: string | null; precio: number | null }>();
  for (const s of subs) {
    if (String(s.estado ?? "").trim().toLowerCase() !== "activa") continue;
    const cid = String(s.cliente_id ?? "");
    if (!cid || map.has(cid)) continue;
    const planId = String(s.plan_id ?? "");
    map.set(cid, {
      plan: planNombre.get(planId) || null,
      precio: s.precio != null ? Number(s.precio) : null,
    });
  }
  return map;
}

/** Resumen + lista de clientes con deuda (total_adeudado > 0). */
export async function cargarCobranzas(
  sb: Sb,
  empresaId: string,
  hoyYmd: string
): Promise<{ resumen: CobranzasResumen; clientes: ClienteCobranza[] }> {
  const [clientesRows, facturasRows, suscripcionPorCliente] = await Promise.all([
    fetchAll(sb, "clientes", "id, empresa, nombre_contacto, tipo_servicio_cliente, created_at", empresaId),
    fetchAll(sb, "facturas", "id, cliente_id, fecha, fecha_vencimiento, monto, saldo, estado", empresaId),
    cargarSuscripcionPorCliente(sb, empresaId),
  ]);

  // Último pago por cliente (pagos → factura → cliente).
  const facturaCliente = new Map<string, string>();
  for (const f of facturasRows) facturaCliente.set(String(f.id), String(f.cliente_id ?? ""));
  const pagosRows = await fetchAll(sb, "pagos", "factura_id, fecha_pago", empresaId);
  const ultimoPagoPorCliente = new Map<string, string>();
  for (const p of pagosRows) {
    const cid = facturaCliente.get(String(p.factura_id ?? ""));
    if (!cid) continue;
    const fp = ymd(p.fecha_pago as string);
    if (!fp) continue;
    const prev = ultimoPagoPorCliente.get(cid);
    if (!prev || fp > prev) ultimoPagoPorCliente.set(cid, fp);
  }

  const clienteInfo = new Map<string, Record<string, unknown>>();
  for (const c of clientesRows) clienteInfo.set(String(c.id), c);

  type Acc = {
    total: number;
    cuotasVencidas: number;
    meses: Set<string>;
    proximoVenc: string | null;
  };
  const acc = new Map<string, Acc>();

  for (const f of facturasRows) {
    const cid = String(f.cliente_id ?? "");
    if (!cid) continue;
    const saldo = Number(f.saldo) || 0;
    if (saldo <= 0 || !esDeuda(f.estado as string)) continue;
    let a = acc.get(cid);
    if (!a) {
      a = { total: 0, cuotasVencidas: 0, meses: new Set(), proximoVenc: null };
      acc.set(cid, a);
    }
    a.total += saldo;
    const venc = ymd(f.fecha_vencimiento as string);
    if (venc && venc < hoyYmd) {
      a.cuotasVencidas += 1;
      const mes = ymd(f.fecha as string).slice(0, 7);
      if (mes) a.meses.add(mes);
    } else if (venc) {
      // próximo vencimiento = el más cercano aún no vencido
      if (!a.proximoVenc || venc < a.proximoVenc) a.proximoVenc = venc;
    }
  }

  const clientes: ClienteCobranza[] = [];
  const resumen: CobranzasResumen = {
    total_adeudado: 0,
    clientes_con_deuda: 0,
    cuotas_vencidas_total: 0,
    por_tramo: { al_dia: 0, tramo_1: 0, tramo_2: 0, tramo_3: 0 },
  };

  for (const [cid, a] of acc) {
    if (a.total <= 0) continue;
    const c = clienteInfo.get(cid);
    const label = String(c?.nombre_contacto ?? c?.empresa ?? cid.slice(0, 8)).trim() || cid.slice(0, 8);
    const sus = suscripcionPorCliente.get(cid);
    const tramo = tramoDe(a.cuotasVencidas);
    clientes.push({
      cliente_id: cid,
      cliente_label: label,
      tipo: tipoClienteLabel(c?.tipo_servicio_cliente as string),
      plan: sus?.plan ?? null,
      monto_mensual: sus?.precio ?? null,
      total_adeudado: Math.round(a.total * 100) / 100,
      cuotas_vencidas: a.cuotasVencidas,
      meses_adeudados: [...a.meses].sort(),
      tramo,
      ultimo_pago: ultimoPagoPorCliente.get(cid) ?? null,
      proximo_vencimiento: a.proximoVenc,
    });
    resumen.total_adeudado += a.total;
    resumen.clientes_con_deuda += 1;
    resumen.cuotas_vencidas_total += a.cuotasVencidas;
    resumen.por_tramo[tramo] += 1;
  }

  resumen.total_adeudado = Math.round(resumen.total_adeudado * 100) / 100;
  // Orden: tramo más alto primero, luego mayor deuda.
  const peso: Record<TramoKey, number> = { tramo_3: 3, tramo_2: 2, tramo_1: 1, al_dia: 0 };
  clientes.sort((x, y) => peso[y.tramo] - peso[x.tramo] || y.total_adeudado - x.total_adeudado);

  return { resumen, clientes };
}

/** Detalle de un cliente para el drawer. */
export async function cargarDetalleCliente(
  sb: Sb,
  empresaId: string,
  clienteId: string,
  hoyYmd: string
): Promise<DetalleCobranza | null> {
  const { data: cRows } = await sb
    .from("clientes")
    .select("id, empresa, nombre_contacto, tipo_servicio_cliente, created_at")
    .eq("empresa_id", empresaId)
    .eq("id", clienteId)
    .limit(1);
  const c = (cRows ?? [])[0] as Record<string, unknown> | undefined;
  if (!c) return null;

  const { data: fRows } = await sb
    .from("facturas")
    .select("id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo")
    .eq("empresa_id", empresaId)
    .eq("cliente_id", clienteId);
  const facturas = (fRows ?? []) as Record<string, unknown>[];

  const facturaNumero = new Map<string, string | null>();
  for (const f of facturas) facturaNumero.set(String(f.id), (f.numero_factura as string) ?? null);

  const facturaIds = facturas.map((f) => String(f.id));
  const pagos: PagoLite[] = [];
  for (let i = 0; i < facturaIds.length; i += 120) {
    const slice = facturaIds.slice(i, i + 120);
    if (slice.length === 0) break;
    const { data: pRows } = await sb
      .from("pagos")
      .select("factura_id, fecha_pago, monto, metodo_pago")
      .eq("empresa_id", empresaId)
      .in("factura_id", slice);
    for (const p of (pRows ?? []) as Record<string, unknown>[]) {
      pagos.push({
        factura_id: String(p.factura_id ?? ""),
        numero_factura: facturaNumero.get(String(p.factura_id ?? "")) ?? null,
        fecha_pago: ymd(p.fecha_pago as string) || null,
        monto: Number(p.monto) || 0,
        metodo_pago: (p.metodo_pago as string) ?? null,
      });
    }
  }
  pagos.sort((a, b) => (b.fecha_pago ?? "").localeCompare(a.fecha_pago ?? ""));

  const pendientes: FacturaLite[] = [];
  const vencidas: FacturaLite[] = [];
  const meses = new Set<string>();
  let totalDeuda = 0;
  for (const f of facturas) {
    const saldo = Number(f.saldo) || 0;
    if (saldo <= 0 || !esDeuda(f.estado as string)) continue;
    const venc = ymd(f.fecha_vencimiento as string);
    const esVencida = !!venc && venc < hoyYmd;
    const lite: FacturaLite = {
      id: String(f.id),
      numero_factura: (f.numero_factura as string) ?? null,
      fecha: ymd(f.fecha as string) || null,
      fecha_vencimiento: venc || null,
      monto: Number(f.monto) || 0,
      saldo,
      estado: (f.estado as string) ?? null,
      tipo: (f.tipo as string) ?? null,
      vencida: esVencida,
    };
    totalDeuda += saldo;
    if (esVencida) {
      vencidas.push(lite);
      const mes = ymd(f.fecha as string).slice(0, 7);
      if (mes) meses.add(mes);
    } else {
      pendientes.push(lite);
    }
  }
  pendientes.sort((a, b) => (a.fecha_vencimiento ?? "").localeCompare(b.fecha_vencimiento ?? ""));
  vencidas.sort((a, b) => (a.fecha_vencimiento ?? "").localeCompare(b.fecha_vencimiento ?? ""));

  const sus = (await cargarSuscripcionPorCliente(sb, empresaId)).get(clienteId);
  const label = String(c.nombre_contacto ?? c.empresa ?? clienteId.slice(0, 8)).trim() || clienteId.slice(0, 8);

  return {
    cliente: {
      cliente_id: clienteId,
      cliente_label: label,
      tipo: tipoClienteLabel(c.tipo_servicio_cliente as string),
      plan: sus?.plan ?? null,
      monto_mensual: sus?.precio ?? null,
      alta: ymd(c.created_at as string) || null,
    },
    total_deuda: Math.round(totalDeuda * 100) / 100,
    cuotas_vencidas: vencidas.length,
    tramo: tramoDe(vencidas.length),
    meses_adeudados: [...meses].sort(),
    facturas_pendientes: pendientes,
    facturas_vencidas: vencidas,
    pagos_recientes: pagos.slice(0, 10),
  };
}
