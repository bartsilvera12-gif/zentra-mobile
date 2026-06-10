"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Plus,
  ReceiptText,
  ShoppingCart,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useDashboardData } from "@/shared/hooks/useDashboard";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";
import {
  buildMontoNcAprobadaPorFacturaId,
  esFacturaAnulada,
  esFacturaCorregidaNc,
  montoFacturaNetoValorComercial,
  type FacturaRaw,
  type NotaCreditoDashRow,
} from "@/lib/dashboard/data";
import { enMesCalendarioActual } from "@/lib/fechas/calendario";

/**
 * Dashboard mobile — vista compacta diseñada desde cero para pantalla angosta.
 *
 * No replica el dashboard desktop (2847 líneas, 12 secciones). Muestra solo lo
 * que el usuario quiere ver de un vistazo en el celular:
 *   1. Saludo con nombre + fecha.
 *   2. 4 KPIs principales en grid 2x2 (ventas mes, por cobrar, clientes, stock crítico).
 *   3. Acciones rápidas (chips horizontales) para crear venta/cliente/pago/gasto.
 *   4. Actividad reciente — últimas 5 facturas emitidas.
 *
 * Toda la lógica numérica (totales, recortes por anulaciones/NC) consume las
 * mismas funciones de @/lib/dashboard/data que usa el desktop — cero duplicación.
 */
export default function DashboardMobile() {
  const { data, isLoading, error } = useDashboardData();
  const { usuario } = useUsuarioActual();

  const ncPorFactura = useMemo(
    () => buildMontoNcAprobadaPorFacturaId((data?.notas_credito ?? []) as NotaCreditoDashRow[]),
    [data?.notas_credito]
  );
  const kpis = useMemo(() => calcularKpisMes(data), [data]);
  const facturasRecientes = useMemo(
    () => obtenerFacturasRecientes(data?.facturas ?? [], ncPorFactura),
    [data?.facturas, ncPorFactura]
  );

  const greeting = useMemo(() => buildGreeting(usuario?.nombre), [usuario?.nombre]);
  const fechaHoy = useMemo(() => formatFechaLargo(new Date()), []);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los datos del dashboard. Intentá refrescar.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-4">
      {/* Saludo */}
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-400">{fechaHoy}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{greeting}</h1>
      </header>

      {/* KPIs en grid 2x2 */}
      <section aria-label="Resumen del mes">
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Ventas del mes"
            value={formatGs(kpis.ventasMes)}
            icon={ShoppingCart}
            tone="primary"
            isLoading={isLoading}
            href="/ventas"
          />
          <KpiCard
            label="Por cobrar"
            value={formatGs(kpis.porCobrar)}
            sub={kpis.facturasPendientes > 0 ? `${kpis.facturasPendientes} facturas` : "Sin pendientes"}
            icon={ReceiptText}
            tone="warn"
            isLoading={isLoading}
            href="/pagos"
          />
          <KpiCard
            label="Clientes activos"
            value={kpis.clientesActivos.toLocaleString("es-PY")}
            icon={UserPlus}
            tone="info"
            isLoading={isLoading}
            href="/clientes"
          />
          <KpiCard
            label="Stock crítico"
            value={kpis.stockCritico.toLocaleString("es-PY")}
            sub={kpis.stockCritico > 0 ? "productos bajo mínimo" : "todo en stock"}
            icon={ClipboardList}
            tone={kpis.stockCritico > 0 ? "danger" : "muted"}
            isLoading={isLoading}
            href="/inventario"
          />
        </div>
      </section>

      {/* Acciones rápidas */}
      <section aria-label="Acciones rápidas">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Acciones rápidas
        </h2>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <QuickAction href="/ventas/nueva" icon={ShoppingCart} label="Nueva venta" />
          <QuickAction href="/clientes/nuevo" icon={UserPlus} label="Nuevo cliente" />
          <QuickAction href="/pagos" icon={Wallet} label="Registrar pago" />
          <QuickAction href="/gastos/nuevo" icon={Plus} label="Gasto" />
        </div>
      </section>

      {/* Actividad reciente */}
      <section aria-label="Actividad reciente">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Facturas recientes
          </h2>
          <Link
            href="/pagos"
            className="flex items-center gap-1 text-xs font-medium text-[#0EA5E9] hover:text-[#0284C7]"
          >
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {isLoading ? (
          <SkeletonList count={3} />
        ) : facturasRecientes.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Sin facturas emitidas este mes.
          </p>
        ) : (
          <ul className="space-y-2">
            {facturasRecientes.map((f) => (
              <li key={String(f.id)}>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0EA5E9]/10 text-[#0EA5E9]">
                    <ReceiptText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      Factura {f.numero_factura}
                    </p>
                    <p className="text-[11px] text-slate-500">{formatFechaCorto(f.fecha)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatGs(f.montoNeto)}
                    </p>
                    <p className="text-[11px] capitalize text-slate-500">{f.estado}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Link a vista completa (desktop) */}
      <div className="pt-2 pb-4">
        <Link
          href="/?tab=resumen"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver dashboard completo <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

type Tone = "primary" | "warn" | "info" | "danger" | "muted";

const TONE_CLASSES: Record<Tone, { bg: string; fg: string; iconBg: string }> = {
  primary: { bg: "bg-white border-slate-200", fg: "text-slate-900", iconBg: "bg-[#0EA5E9]/10 text-[#0EA5E9]" },
  warn:    { bg: "bg-white border-amber-200", fg: "text-slate-900", iconBg: "bg-amber-100 text-amber-700" },
  info:    { bg: "bg-white border-slate-200", fg: "text-slate-900", iconBg: "bg-violet-100 text-violet-700" },
  danger:  { bg: "bg-red-50 border-red-200", fg: "text-red-900", iconBg: "bg-red-100 text-red-700" },
  muted:   { bg: "bg-slate-50 border-slate-200", fg: "text-slate-600", iconBg: "bg-slate-200 text-slate-600" },
};

function KpiCard({
  label,
  value,
  sub,
  icon: IconComp,
  tone,
  isLoading,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  isLoading?: boolean;
  href?: string;
}) {
  const t = TONE_CLASSES[tone];
  const inner = (
    <div className={`group flex h-full flex-col rounded-2xl border ${t.bg} p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-transform active:scale-[0.98]`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.iconBg}`}>
          <IconComp className="h-4 w-4" />
        </div>
        {href ? <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" /> : null}
      </div>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 break-words text-lg font-bold leading-tight tabular-nums ${t.fg}`}>
        {isLoading ? <span className="inline-block h-5 w-20 animate-pulse rounded bg-slate-200" /> : value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block min-h-[110px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]/40 rounded-2xl">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickAction({
  href,
  icon: IconComp,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors active:bg-slate-50"
    >
      <IconComp className="h-4 w-4 text-[#0EA5E9]" />
      {label}
    </Link>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Cálculos ────────────────────────────────────────────────────────────────

type Kpis = {
  ventasMes: number;
  porCobrar: number;
  facturasPendientes: number;
  clientesActivos: number;
  stockCritico: number;
};

function calcularKpisMes(data: Awaited<ReturnType<typeof import("@/lib/dashboard/data").getDashboardData>> | undefined): Kpis {
  if (!data) {
    return { ventasMes: 0, porCobrar: 0, facturasPendientes: 0, clientesActivos: 0, stockCritico: 0 };
  }

  const ncPorFactura = buildMontoNcAprobadaPorFacturaId((data.notas_credito ?? []) as NotaCreditoDashRow[]);

  const facturasEmitidas = (data.facturas ?? []).filter(
    (f) => !esFacturaAnulada(f.estado) && !esFacturaCorregidaNc(f.estado)
  );

  const ventasMes = facturasEmitidas
    .filter((f) => enMesCalendarioActual(f.fecha))
    .reduce((acc, f) => acc + montoFacturaNetoValorComercial(f, ncPorFactura), 0);

  const facturasPorCobrar = facturasEmitidas.filter((f) => Number(f.saldo ?? 0) > 0);
  const porCobrar = facturasPorCobrar.reduce((acc, f) => acc + Number(f.saldo ?? 0), 0);

  const clientesActivos = (data.clientes ?? []).length;
  const stockCritico = (data.productos ?? []).filter(
    (p) => Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)
  ).length;

  return {
    ventasMes,
    porCobrar,
    facturasPendientes: facturasPorCobrar.length,
    clientesActivos,
    stockCritico,
  };
}

function obtenerFacturasRecientes(
  facturas: FacturaRaw[],
  ncPorFactura: Map<string, number>
): Array<FacturaRaw & { montoNeto: number }> {
  return facturas
    .filter((f) => !esFacturaAnulada(f.estado))
    .slice()
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
    .slice(0, 5)
    .map((f) => ({ ...f, montoNeto: montoFacturaNetoValorComercial(f, ncPorFactura) }));
}

// ── Formatters ──────────────────────────────────────────────────────────────

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatFechaCorto(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
}

function formatFechaLargo(d: Date): string {
  const formatted = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function buildGreeting(nombre: string | null | undefined): string {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buen día" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  if (!nombre) return `${saludo}`;
  const primer = nombre.trim().split(/\s+/)[0];
  return `${saludo}, ${primer}`;
}

