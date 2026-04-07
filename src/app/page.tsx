"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getConfig } from "@/lib/config/storage";
import { getUsuarios } from "@/lib/usuarios/storage";
import { getDashboardData } from "@/lib/dashboard/data";
import type { ConfigGlobal } from "@/lib/config/types";
import type { Usuario } from "@/lib/usuarios/types";
import type {
  ProspectoRaw,
  ClienteRaw,
  FacturaRaw,
  PagoRaw,
  TipificacionRaw,
  ProductoRaw,
  VentaRaw,
  CompraRaw,
  GastoRaw,
} from "@/lib/dashboard/data";
import { enRangoCalendario, enMesCalendarioActual } from "@/lib/fechas/calendario";

// ── ZENTRA (solo dashboard / esta página) ─────────────────────────────────────
const Z = {
  bg:       "#0B1C3D",
  surface:  "#111F4A",
  card:     "#14235A",
  accent:   "#2563EB",
  text:     "#FFFFFF",
  muted:    "#AAB4D6",
  success:  "#22C55E",
  error:    "#EF4444",
} as const;

function ZentraMark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-inner ${className}`}
      style={{ backgroundColor: Z.card }}
    >
      <span className="text-xl font-extrabold leading-none tracking-tight" style={{ color: Z.accent }}>
        Z
      </span>
    </div>
  );
}

function labelClienteDimension(raw: string): string {
  const s = raw.trim();
  if (!s) return "Sin clasificar";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Periodo = "hoy" | "7d" | "30d" | "mes" | "anio";
type TabDash = "comercial" | "financiero" | "inventario" | "ventas";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGs(n: number): string {
  return n.toLocaleString("es-PY");
}

/** Formato abreviado: 2.500.000 → 2.5M, 25.000.000 → 25M */
function formatGsM(n: number): string {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return "0";
  if (num >= 1_000_000_000) {
    const b = num / 1_000_000_000;
    return b % 1 === 0 ? `${b}B` : `${b.toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return num.toLocaleString("es-PY");
}

function formatFecha(s: string): string {
  const cal = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cal)) {
    const [y, m, d] = cal.split("-");
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getRango(periodo: Periodo): { desde: Date; hasta: Date } {
  const hasta = new Date(); hasta.setHours(23, 59, 59, 999);
  const desde = new Date();
  switch (periodo) {
    case "hoy":  desde.setHours(0, 0, 0, 0); break;
    case "7d":   desde.setDate(desde.getDate() - 7); desde.setHours(0,0,0,0); break;
    case "30d":  desde.setDate(desde.getDate() - 30); desde.setHours(0,0,0,0); break;
    case "mes":  desde.setDate(1); desde.setHours(0,0,0,0); break;
    case "anio": desde.setMonth(0,1); desde.setHours(0,0,0,0); break;
  }
  return { desde, hasta };
}

/** Fecha pura YYYY-MM-DD: comparación calendario (sin UTC). ISO con hora: rango por instante. */
function enRango(fechaStr: string, desde: Date, hasta: Date): boolean {
  const t = fechaStr.trim();
  const cal = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cal) && t.length <= 10) {
    return enRangoCalendario(cal, desde, hasta);
  }
  const f = new Date(fechaStr);
  return !isNaN(f.getTime()) && f >= desde && f <= hasta;
}

// ── Componentes de gráficos ───────────────────────────────────────────────────

const ETAPA_COLORS: Record<string, string> = {
  LEAD:        "bg-slate-400",
  CONTACTADO:  "bg-[#0EA5E9]",
  NEGOCIACION: "bg-amber-400",
  GANADO:      "bg-[#0EA5E9]",
  PERDIDO:     "bg-red-400",
};

const ETAPA_LABELS: Record<string, string> = {
  LEAD: "Lead", CONTACTADO: "Contactado", NEGOCIACION: "Negociación",
  GANADO: "Ganado", PERDIDO: "Perdido",
};

function PipelineBar({
  data,
}: { data: { etapa: string; count: number; valor: number }[] }) {
  const maxC = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.etapa}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ETAPA_COLORS[d.etapa] ?? "bg-gray-400"}`} />
              <span className="text-xs font-medium text-gray-700">{ETAPA_LABELS[d.etapa] ?? d.etapa}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="tabular-nums font-semibold text-gray-700">{d.count}</span>
              <span className="tabular-nums w-20 text-right">Gs. {formatGsM(d.valor)}</span>
            </div>
          </div>
          <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${ETAPA_COLORS[d.etapa] ?? "bg-gray-400"}`}
              style={{ width: `${d.count > 0 ? Math.max((d.count / maxC) * 100, 4) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function HBarChart({
  data, color = "bg-blue-400",
}: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 truncate shrink-0" title={d.label}>{d.label}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all`}
              style={{ width: `${d.value > 0 ? Math.max((d.value / max) * 100, 3) : 0}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 w-8 text-right tabular-nums shrink-0">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">Sin datos</p>}
    </div>
  );
}

function AreaChart({
  data, color = "#6366f1",
}: { data: { label: string; value: number }[]; color?: string }) {
  if (data.length < 2) return <p className="text-xs text-gray-400 py-8 text-center">Sin datos suficientes</p>;
  const W = 480, H = 130, PL = 48, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const max = Math.max(...data.map(d => d.value), 1);
  const pts = data.map((d, i) => ({
    x: PL + (i / (data.length - 1)) * cW,
    y: PT + cH - (d.value / max) * cH,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)} L${PL},${(PT + cH).toFixed(1)} Z`;
  const yTicks = [0, Math.floor(max / 2), max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {yTicks.map((v, i) => {
        const y = PT + cH - (v / max) * cH;
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {formatGsM(v)}
            </text>
          </g>
        );
      })}
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />)}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={i} x={pts[i].x} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {d.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function DonutChart({
  segments,
  centerLabel = "total",
  formatValue = (v: number) => String(v),
  variant = "light",
  legendDetail = false,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string;
  formatValue?: (v: number) => string;
  variant?: "light" | "zentra";
  /** Muestra cantidad y % sobre el total en la leyenda */
  legendDetail?: boolean;
}) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  const isZ = variant === "zentra";
  if (total === 0) {
    return (
      <div className="flex items-center gap-6">
        <div
          className={`flex h-32 w-32 shrink-0 items-center justify-center rounded-full ${isZ ? "border border-white/10" : "bg-gray-100"}`}
          style={isZ ? { backgroundColor: Z.surface } : undefined}
        >
          <span className={`text-xs ${isZ ? "" : "text-gray-400"}`} style={isZ ? { color: Z.muted } : undefined}>
            Sin datos
          </span>
        </div>
      </div>
    );
  }
  const R = 50, CX = 80, CY = 80, C = 2 * Math.PI * R;
  let cum = 0;
  const fillCenter = isZ ? Z.text : "#1f2937";
  const fillSub = isZ ? Z.muted : "#9ca3af";
  return (
    <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
      <svg viewBox="0 0 160 160" className="mx-auto h-36 w-36 shrink-0 sm:mx-0">
        {segments.map((seg, i) => {
          if (seg.value === 0) return null;
          const pct = seg.value / total;
          const dash = pct * C;
          const rot = cum * 360 - 90;
          cum += pct;
          return (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth="22"
              strokeDasharray={`${dash} ${C - dash}`}
              transform={`rotate(${rot} ${CX} ${CY})`}
            />
          );
        })}
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="17" fontWeight="bold" fill={fillCenter}>
          {formatValue(total)}
        </text>
        <text x={CX} y={CY + 20} textAnchor="middle" fontSize="9" fill={fillSub}>
          {centerLabel}
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-2.5">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span
                className={`min-w-0 flex-1 truncate text-xs ${isZ ? "" : "text-gray-600"}`}
                style={isZ ? { color: Z.text } : undefined}
                title={seg.label}
              >
                {seg.label}
              </span>
              {legendDetail ? (
                <span
                  className="shrink-0 text-xs font-semibold tabular-nums"
                  style={{ color: isZ ? Z.muted : "#1f2937" }}
                >
                  {formatValue(seg.value)} · {pct.toFixed(1)}%
                </span>
              ) : (
                <span className={`shrink-0 text-xs font-bold tabular-nums ${isZ ? "" : "text-gray-800"}`} style={isZ ? { color: Z.muted } : undefined}>
                  {formatValue(seg.value)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  meta,
  format = "number",
  variant = "light",
}: {
  label: string;
  value: number;
  meta: number;
  format?: "number" | "gs" | "pct";
  variant?: "light" | "zentra";
}) {
  const pct = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
  const color =
    variant === "zentra"
      ? pct >= 100
        ? Z.success
        : pct >= 70
          ? "#F59E0B"
          : Z.accent
      : null;
  const barClass =
    variant === "light"
      ? pct >= 100
        ? "bg-green-500"
        : pct >= 70
          ? "bg-amber-400"
          : "bg-blue-500"
      : "";
  const fmt = (n: number) =>
    format === "gs" ? `Gs. ${formatGsM(n)}` : format === "pct" ? `${n.toFixed(1)}%` : String(n);
  const isZ = variant === "zentra";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-xs font-semibold ${isZ ? "" : "text-gray-700"}`} style={isZ ? { color: Z.text } : undefined}>
          {label}
        </span>
        <span className={`text-xs tabular-nums ${isZ ? "" : "text-gray-500"}`} style={isZ ? { color: Z.muted } : undefined}>
          {fmt(value)} <span style={{ color: isZ ? "rgba(255,255,255,0.2)" : "#d1d5db" }}>/</span> {fmt(meta)}
        </span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${isZ ? "" : "bg-gray-100"}`} style={isZ ? { backgroundColor: "rgba(255,255,255,0.08)" } : undefined}>
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={isZ ? { width: `${pct}%`, backgroundColor: color ?? Z.accent } : { width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${isZ ? "" : "text-gray-400"}`} style={isZ ? { color: Z.muted } : undefined}>
        {pct.toFixed(0)}% de la meta
      </p>
    </div>
  );
}

/** Gauge semicircular tipo Power BI: valor actual, meta, porcentaje alcanzado */
function GaugeChart({ label, value, meta, format = "number" }: {
  label: string; value: number; meta: number; format?: "number" | "gs" | "pct";
}) {
  const pct = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
  const fmt = (n: number) =>
    format === "gs"  ? `Gs. ${formatGsM(n)}` :
    format === "pct" ? `${n.toFixed(1)}%`    : String(n);
  const strokeColor = pct >= 100 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#0EA5E9";
  const W = 180, H = 110, CX = W / 2, CY = H - 12, R = 65;
  const pathSemi = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">{label}</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[180px]" style={{ height: 110 }}>
        <path d={pathSemi} fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round" pathLength={100} />
        <path
          d={pathSemi}
          fill="none"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
        />
        <text x={CX} y={CY - 14} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1f2937">{fmt(value)}</text>
        <text x={CX} y={CY + 2} textAnchor="middle" fontSize="9" fill="#9ca3af">Meta: {fmt(meta)}</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill={strokeColor}>{pct.toFixed(0)}% alcanzado</text>
      </svg>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "text-[#0F172A]", icon, variation,
}: { label: string; value: string; sub?: string; color?: string; icon: string; variation?: number }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-2xl">{icon}</div>
        {variation !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              variation >= 0 ? "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]" : "bg-[var(--badge-error-bg)] text-[var(--badge-error-text)]"
            }`}
          >
            {variation >= 0 ? "+" : ""}{variation}%
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold mt-3 tabular-nums ${color}`}>{value}</p>
      <p className="text-xs font-medium text-[#475569] mt-1">{label}</p>
      {sub && <p className="text-xs text-[#475569] mt-1">{sub}</p>}
    </motion.div>
  );
}

// ── Dashboard Comercial ───────────────────────────────────────────────────────

function DashComercial({
  prospectos, clientes, tipificaciones, usuario, periodo, config,
}: {
  prospectos:     ProspectoRaw[];
  clientes:       ClienteRaw[];
  tipificaciones: TipificacionRaw[];
  usuario:        Usuario | null;
  periodo:        Periodo;
  config:         ConfigGlobal;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  // Filtrar por área si es supervisor
  const isSupervisor = usuario?.nivel === "supervisor";
  const area         = usuario?.area;

  const prospectosFilt = useMemo(() =>
    prospectos.filter((p) => {
      if (isSupervisor && area === "ventas" && p.responsable)
        return p.responsable.toUpperCase() === usuario?.nombre.toUpperCase();
      return true;
    }),
    [prospectos, isSupervisor, area, usuario]
  );

  // KPIs periodo (datos reales de crm_prospectos, filtrados por empresa_id vía getDashboardData)
  const leadsNuevos    = prospectosFilt.filter(p => enRango(p.fecha_creacion, desde, hasta)).length;
  const enNegociacion  = prospectosFilt.filter(p => p.etapa === "NEGOCIACION").length;
  const clientesGanados= prospectosFilt.filter(p => p.etapa === "GANADO" && enRango(p.fecha_actualizacion, desde, hasta)).length;
  const totalLeadsPeriodo = prospectosFilt.filter(p => enRango(p.fecha_creacion, desde, hasta)).length;
  const tasaConversion = totalLeadsPeriodo > 0 ? (clientesGanados / totalLeadsPeriodo) * 100 : 0;

  // Pipeline por etapa (snapshot actual)
  const ETAPAS = ["LEAD", "CONTACTADO", "NEGOCIACION", "GANADO", "PERDIDO"];
  const pipeline = ETAPAS.map(etapa => ({
    etapa,
    count: prospectosFilt.filter(p => p.etapa === etapa).length,
    valor: prospectosFilt.filter(p => p.etapa === etapa)
      .reduce((s, p) => s + (p.valor_estimado ?? 0), 0),
  }));

  // Planes pendientes de cierre (top 5 en negociación por valor)
  const planesPendientes = useMemo(() =>
    prospectosFilt
      .filter(p => p.etapa === "NEGOCIACION")
      .sort((a, b) => (b.valor_estimado ?? 0) - (a.valor_estimado ?? 0))
      .slice(0, 5)
      .map(p => ({
        empresa: p.empresa,
        plan: p.servicio ?? "—",
        monto: p.valor_estimado ?? 0,
        responsable: p.responsable ?? "—",
        fecha: p.fecha_creacion,
      })),
    [prospectosFilt]
  );

  // Top planes en negociación (agrupado por plan, ordenado por SUM(valor_estimado))
  const topPlanesEnNegociacion = useMemo(() => {
    const enNeg = prospectosFilt.filter(p => p.etapa === "NEGOCIACION");
    const porPlan: Record<string, number> = {};
    for (const p of enNeg) {
      const plan = (p.servicio ?? "").trim() || "Otros";
      porPlan[plan] = (porPlan[plan] ?? 0) + (p.valor_estimado ?? 0);
    }
    return Object.entries(porPlan)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [prospectosFilt]);

  // Top planes vendidos del mes (prospectos GANADO en mes actual, por cantidad de cierres)
  const topPlanesVendidos = useMemo(() => {
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const mesFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const ganadosMes = prospectosFilt.filter(
      p => p.etapa === "GANADO" && enRango(p.fecha_actualizacion, mesInicio, mesFin)
    );
    const porPlan: Record<string, number> = {};
    for (const p of ganadosMes) {
      const planes = (p.servicio ?? "").split(",").map(s => s.trim()).filter(Boolean);
      for (const plan of planes.length ? planes : ["Otros"]) {
        const key = plan || "Otros";
        porPlan[key] = (porPlan[key] ?? 0) + 1;
      }
    }
    return Object.entries(porPlan)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [prospectosFilt]);

  // Rendimiento por usuario (clientes ganados)
  const rendimiento = useMemo(() => {
    const map: Record<string, number> = {};
    prospectosFilt
      .filter(p => p.etapa === "GANADO" && enRango(p.fecha_actualizacion, desde, hasta))
      .forEach(p => {
        const v = p.responsable ?? "Sin asignar";
        map[v] = (map[v] ?? 0) + 1;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [prospectosFilt, desde, hasta]);

  // Top clientes por origen
  const topClientes = useMemo(() =>
    clientes
      .filter(c => enRango(c.created_at, desde, hasta))
      .slice(0, 8)
      .map(c => ({
        nombre: c.empresa ?? c.nombre_contacto,
        codigo: c.codigo_cliente,
        origen: c.origen,
      })),
    [clientes, desde, hasta]
  );

  // Timeline de actividad
  const timeline = useMemo(() => {
    type Evento = { fecha: string; tipo: string; texto: string; color: string };
    const eventos: Evento[] = [];
    prospectos
      .filter(p => enRango(p.fecha_creacion, desde, hasta))
      .forEach(p => eventos.push({
        fecha: p.fecha_creacion,
        tipo: "Lead creado",
        texto: p.empresa,
        color: "bg-blue-100 text-blue-700",
      }));
    clientes
      .filter(c => enRango(c.created_at, desde, hasta))
      .forEach(c => eventos.push({
        fecha: c.created_at,
        tipo: "Cliente ganado",
        texto: c.empresa ?? c.nombre_contacto,
        color: "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
      }));
    tipificaciones
      .filter(t => enRango(t.fecha, desde, hasta))
      .forEach(t => eventos.push({
        fecha: t.fecha,
        tipo: "Tipificación",
        texto: t.tipo_gestion,
        color: "bg-violet-100 text-violet-700",
      }));
    return eventos
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 12);
  }, [prospectos, clientes, tipificaciones, desde, hasta]);

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="🎯" label="Leads nuevos"      value={String(leadsNuevos)} color="text-[#0EA5E9]" variation={12} />
        <KpiCard icon="💬" label="En negociación"    value={String(enNegociacion)} color="text-amber-600" />
        <KpiCard icon="✅" label="Clientes ganados"  value={String(clientesGanados)} color="text-[#0EA5E9]" variation={8} />
        <KpiCard icon="📈" label="Tasa de conversión" value={`${tasaConversion.toFixed(1)}%`}
          color={tasaConversion >= config.meta_conversion_leads ? "text-[#0EA5E9]" : "text-[#0F172A]"}
          variation={tasaConversion >= config.meta_conversion_leads ? 5 : -2} />
      </div>

      {/* Metas comerciales — gauge charts tipo Power BI */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-6">Progreso de metas</h3>
        <div className="grid grid-cols-2 gap-8">
          <GaugeChart label="Clientes nuevos" value={clientesGanados} meta={config.meta_clientes_nuevos} />
          <GaugeChart label="Conversión de leads" value={tasaConversion} meta={config.meta_conversion_leads} format="pct" />
        </div>
      </div>

      {/* Pipeline + Rendimiento */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">Pipeline CRM</h3>
          <PipelineBar data={pipeline} />
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">
            Clientes ganados por vendedor
          </h3>
          <HBarChart data={rendimiento} color="bg-[#0EA5E9]" />
        </motion.div>
      </div>

      {/* Planes pendientes de cierre + Top planes vendidos */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">Planes pendientes de cierre</h3>
          {planesPendientes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin prospectos en negociación</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2">Empresa</th>
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2">Plan</th>
                  <th className="text-right text-xs font-semibold text-slate-600 px-3 py-2">Monto</th>
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2">Responsable</th>
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {planesPendientes.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs font-medium text-gray-800 truncate max-w-[100px]" title={p.empresa}>{p.empresa}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[80px]" title={p.plan}>{p.plan}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-gray-700">Gs. {formatGsM(p.monto)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[80px]">{p.responsable}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatFecha(p.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">Top planes vendidos del mes</h3>
          <HBarChart data={topPlanesVendidos} color="bg-green-500" />
        </motion.div>
      </div>

      {/* Top planes en negociación */}
      <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
        <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">Top planes en negociación</h3>
        {topPlanesEnNegociacion.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Sin prospectos en negociación</p>
        ) : (
          <DonutChart
            segments={topPlanesEnNegociacion.map((d, i) => ({
              label: d.label,
              value: d.value,
              color: ["#F59E0B", "#F97316", "#FB923C", "#FDBA74", "#FED7AA"][i] ?? "#9ca3af",
            }))}
            centerLabel="monto total"
            formatValue={(v) => formatGsM(v)}
          />
        )}
      </motion.div>

      {/* Top clientes + Timeline */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-4">
            Clientes del periodo
          </h3>
          {topClientes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin clientes en el periodo</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {topClientes.map((c, i) => (
                  <tr key={i} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 text-sm font-medium text-[#0F172A] truncate max-w-[140px]">{c.nombre}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-[#475569]">{c.origen}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Actividad reciente
          </h3>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin actividad en el periodo</p>
          ) : (
            <div className="space-y-2.5">
              {timeline.map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${e.color}`}>
                    {e.tipo}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{e.texto}</p>
                    <p className="text-xs text-gray-400">{formatFecha(e.fecha)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

    </div>
  );
}

// ── Dashboard Financiero ──────────────────────────────────────────────────────

function DashFinanciero({
  facturas, pagos, clientes, ventas, periodo, config,
}: {
  facturas:  FacturaRaw[];
  pagos:     PagoRaw[];
  clientes:  ClienteRaw[];
  ventas:    VentaRaw[];
  periodo:   Periodo;
  config:    ConfigGlobal;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  // Bloque principal: métricas del período (misma ventana que el filtro superior: enRango + fechas calendario)
  const facturasValidas = facturas.filter(f => f.estado !== "Anulado");
  const facturasPeriodo = facturasValidas.filter(f => enRango(f.fecha, desde, hasta));
  const sumMonto = <T extends { monto?: unknown }>(arr: T[]) =>
    arr.reduce((acc, x) => { const v = Number(x.monto); return acc + (Number.isFinite(v) ? v : 0); }, 0);
  const aCobrarPeriodo = sumMonto(facturasPeriodo);
  const pagosPeriodo    = pagos.filter(p => enRango(p.fecha_pago, desde, hasta));
  const cobradoPeriodo  = sumMonto(pagosPeriodo);
  const pendientePeriodo = aCobrarPeriodo - cobradoPeriodo;
  const pctCobranza =
    aCobrarPeriodo > 0 ? (cobradoPeriodo / aCobrarPeriodo) * 100 : null;
  const facturaNumById  = useMemo(
    () => Object.fromEntries(facturas.map(f => [String(f.id), f.numero_factura])),
    [facturas]
  );
  const cobradoDetalle  = useMemo(
    () =>
      [...pagosPeriodo]
        .sort((a, b) => (a.fecha_pago < b.fecha_pago ? 1 : a.fecha_pago > b.fecha_pago ? -1 : 0))
        .map((p) => ({
          id: p.id,
          factura_id: p.factura_id,
          numero_factura: facturaNumById[String(p.factura_id)] ?? "—",
          monto: Number(p.monto) || 0,
          fecha_pago: p.fecha_pago.slice(0, 10),
        })),
    [pagosPeriodo, facturaNumById]
  );

  /** Prioridad: tipo de servicio → condición de pago → origen */
  const { dimCliente, segmentosClientes } = useMemo(() => {
    const list = clientes;
    const hasServicio = list.some((c) => (c.tipo_servicio_cliente ?? "").trim() !== "");
    const hasCondicion = list.some((c) => (c.condicion_pago ?? "").trim() !== "");
    const dim: "tipo_servicio" | "condicion" | "origen" = hasServicio
      ? "tipo_servicio"
      : hasCondicion
        ? "condicion"
        : "origen";
    const map = new Map<string, number>();
    for (const c of list) {
      let raw = "";
      if (dim === "tipo_servicio") raw = (c.tipo_servicio_cliente ?? "").trim();
      else if (dim === "condicion") raw = (c.condicion_pago ?? "").trim();
      else raw = (c.origen ?? "").trim();
      const key = raw || "__sin__";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const PALETTE = [Z.accent, "#3B82F6", "#60A5FA", Z.success, "#A78BFA", "#F59E0B", "#EC4899", "#38BDF8"];
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return {
      dimCliente: dim,
      segmentosClientes: entries.map(([k, count], i) => ({
        label: k === "__sin__" ? "Sin clasificar" : labelClienteDimension(k),
        value: count,
        color: PALETTE[i % PALETTE.length],
      })),
    };
  }, [clientes]);

  const cardBase =
    "rounded-2xl border border-white/10 p-8 shadow-lg shadow-black/20 transition-colors";
  const cardStyle = { backgroundColor: Z.card } as const;

  return (
    <div className="space-y-8">

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div whileHover={{ y: -3 }} className={cardBase} style={cardStyle}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: Z.muted }}>
            A cobrar del período
          </p>
          <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight" style={{ color: Z.text }}>
            Gs. {formatGsM(aCobrarPeriodo)}
          </p>
          <div className="mt-4 h-px w-12 rounded-full opacity-60" style={{ backgroundColor: Z.accent }} />
          <p className="mt-4 text-xs leading-relaxed" style={{ color: Z.muted }}>
            Facturas emitidas en el período seleccionado · {facturasPeriodo.length} factura{facturasPeriodo.length === 1 ? "" : "s"}
          </p>
        </motion.div>
        <motion.div whileHover={{ y: -3 }} className={cardBase} style={cardStyle}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: Z.muted }}>
            Cobrado del período
          </p>
          <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight" style={{ color: Z.accent }}>
            Gs. {formatGsM(cobradoPeriodo)}
          </p>
          <div className="mt-4 h-px w-12 rounded-full opacity-60" style={{ backgroundColor: Z.accent }} />
          <p className="mt-4 text-xs leading-relaxed" style={{ color: Z.muted }}>
            Pagos con fecha de pago en el período · {pagosPeriodo.length} pago{pagosPeriodo.length === 1 ? "" : "s"}
          </p>
        </motion.div>
        <motion.div whileHover={{ y: -3 }} className={cardBase} style={cardStyle}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: Z.muted }}>
            Pendiente del período
          </p>
          <p
            className="mt-4 text-3xl font-bold tabular-nums tracking-tight"
            style={{
              color:
                pendientePeriodo > 0 ? "#FBBF24" : pendientePeriodo < 0 ? Z.success : Z.text,
            }}
          >
            {pendientePeriodo < 0 ? "− " : ""}Gs. {formatGsM(Math.abs(pendientePeriodo))}
          </p>
          <div className="mt-4 h-px w-12 rounded-full opacity-60" style={{ backgroundColor: Z.accent }} />
          <p className="mt-4 text-xs leading-relaxed" style={{ color: Z.muted }}>
            A cobrar menos cobrado (solo este período)
          </p>
        </motion.div>
        <motion.div whileHover={{ y: -3 }} className={cardBase} style={cardStyle}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: Z.muted }}>
            % de cobranza
          </p>
          <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight" style={{ color: Z.text }}>
            {pctCobranza == null ? "—" : `${pctCobranza.toFixed(1)}%`}
          </p>
          <div className="mt-4 h-px w-12 rounded-full opacity-60" style={{ backgroundColor: Z.accent }} />
          <p className="mt-4 text-xs leading-relaxed" style={{ color: Z.muted }}>
            Cobrado ÷ A cobrar · {aCobrarPeriodo <= 0 ? "sin emisión en el período" : "mismo filtro de fechas"}
          </p>
        </motion.div>
      </div>

      <div className="rounded-2xl border border-white/10 p-6 sm:p-8" style={{ backgroundColor: Z.card }}>
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: Z.muted }}>
          Desglose cobrado · {periodo}
        </h3>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed" style={{ color: Z.muted }}>
          Pagos cuya <strong style={{ color: Z.text }}>fecha de pago</strong> está en el rango del filtro. Total:{" "}
          <span style={{ color: Z.text }}>Gs. {formatGs(cobradoPeriodo)}</span> (coincide con Cobrado del período).
        </p>
        {cobradoDetalle.length === 0 ? (
          <p className="mt-6 text-sm" style={{ color: Z.muted }}>
            No hay pagos en este período.
          </p>
        ) : (
          <div
            className="mt-5 max-h-56 overflow-auto rounded-xl border border-white/10"
            style={{ backgroundColor: Z.surface }}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-white/10" style={{ backgroundColor: Z.surface }}>
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: Z.muted }}>
                    Factura
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: Z.muted }}>
                    Fecha pago
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: Z.muted }}>
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cobradoDetalle.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.04]">
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: Z.text }}>
                      {row.numero_factura}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: Z.muted }}>
                      {formatFecha(row.fecha_pago)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-medium tabular-nums" style={{ color: Z.text }}>
                      Gs. {formatGs(row.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-2xl border border-white/10 p-6 sm:p-8 lg:col-span-3"
          style={{ backgroundColor: Z.card }}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: Z.muted }}>
            Progreso de metas
          </h3>
          <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <ProgressBar
              variant="zentra"
              label="Facturación mensual"
              value={facturasValidas.filter((f) => enMesCalendarioActual(f.fecha)).reduce((s, f) => s + f.monto, 0)}
              meta={config.meta_facturacion_mensual}
              format="gs"
            />
            <ProgressBar
              variant="zentra"
              label="Ventas mensuales"
              value={ventas
                .filter((v) => enMesCalendarioActual(v.fecha.slice(0, 10)))
                .reduce((s, v) => s + v.total, 0)}
              meta={config.meta_ventas_mensuales}
              format="gs"
            />
          </div>
        </motion.div>
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-2xl border border-white/10 p-6 sm:p-8 lg:col-span-2"
          style={{ backgroundColor: Z.card }}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: Z.muted }}>
            Distribución de clientes
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: Z.muted }}>
            Por{" "}
            {dimCliente === "tipo_servicio"
              ? "tipo de servicio"
              : dimCliente === "condicion"
                ? "condición de pago"
                : "origen"}
            .
          </p>
          <div className="mt-6">
            <DonutChart
              variant="zentra"
              legendDetail
              segments={segmentosClientes}
              centerLabel="clientes"
              formatValue={(v) => String(v)}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Dashboard Inventario ─────────────────────────────────────────────────────

function DashInventario({
  productos,
  compras,
}: {
  productos: ProductoRaw[];
  compras:   CompraRaw[];
}) {
  const totalProductos = productos.length;
  const totalUnidades  = productos.reduce((s, p) => s + p.stock_actual, 0);
  const bajosStock     = productos.filter(p => p.stock_actual <= p.stock_minimo).length;
  const valorTotal     = productos.reduce((s, p) => s + p.stock_actual * p.costo_promedio, 0);

  const cntSaludable = productos.filter(p => p.stock_actual > p.stock_minimo).length;
  const cntBajo      = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length;
  const cntCritico   = productos.filter(p => p.stock_actual <= 0).length;

  const proveedorMap = useMemo(() => {
    const map: Record<string, string> = {};
    compras.forEach(c => { if (c.producto_id) map[String(c.producto_id)] = c.proveedor_nombre; });
    return map;
  }, [compras]);

  const criticos = useMemo(() =>
    productos
      .filter(p => p.stock_actual <= p.stock_minimo)
      .sort((a, b) => a.stock_actual - b.stock_actual)
      .slice(0, 10),
    [productos]
  );

  const topPorValor = useMemo(() =>
    [...productos]
      .map(p => ({ ...p, valor: p.stock_actual * p.costo_promedio }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    [productos]
  );

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="📦" label="Productos totales"      value={String(totalProductos)} color="text-[#0EA5E9]" variation={4} />
        <KpiCard icon="🔢" label="Stock total (unidades)" value={formatGs(totalUnidades)} color="text-[#0EA5E9]" />
        <KpiCard icon="⚠️" label="Bajo stock mínimo"      value={String(bajosStock)}
          sub={bajosStock > 0 ? "requieren reposición" : "todo en orden"}
          color={bajosStock > 0 ? "text-red-600" : "text-[#0EA5E9]"}
          variation={bajosStock > 0 ? -2 : undefined} />
        <KpiCard icon="💎" label="Valor del inventario"   value={`Gs. ${formatGsM(valorTotal)}`} color="text-[#0EA5E9]" variation={12} />
      </div>

      {/* Donut + Críticos */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Estado del stock</h3>
          <DonutChart segments={[
            { label: "Saludable", value: cntSaludable, color: "#22c55e" },
            { label: "Bajo",      value: cntBajo,      color: "#f59e0b" },
            { label: "Crítico",   value: cntCritico,   color: "#ef4444" },
          ]} centerLabel="productos" />
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Productos críticos — stock bajo mínimo
          </h3>
          {criticos.length === 0 ? (
            <div className="flex items-center gap-2 text-[var(--badge-success-text)] bg-[var(--badge-success-bg)] rounded-lg px-4 py-3 text-sm">
              <span>✅</span> Todos los productos tienen stock suficiente.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                    </th>
                    {["Producto", "Stock actual", "Stock mín.", "Estado", "Proveedor"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-3 py-3 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {criticos.map(p => (
                    <tr key={p.id} className={`${p.stock_actual <= 0 ? "bg-red-50/40 dark:bg-red-900/10" : "bg-amber-50/30 dark:bg-amber-900/10"} hover:bg-opacity-80 transition-colors`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">{p.nombre}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-bold tabular-nums ${p.stock_actual <= 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {p.stock_actual} {p.unidad_medida}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{p.stock_minimo} {p.unidad_medida}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.stock_actual <= 0 ? "bg-[var(--badge-error-bg)] text-[var(--badge-error-text)]" : "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]"
                        }`}>
                          {p.stock_actual <= 0 ? "Crítico" : "Bajo"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{proveedorMap[String(p.id)] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Top por valor */}
      <motion.div whileHover={{ y: -2 }} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6 transition-shadow hover:shadow-md">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Top productos por valor de inventario
        </h3>
        {topPorValor.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin productos registrados.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                  </th>
                  {["Producto", "SKU", "Stock", "Costo promedio", "Valor inventario"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-3 py-3 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topPorValor.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">{p.nombre}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{p.sku}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">{p.stock_actual}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">Gs. {formatGs(p.costo_promedio)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-slate-800 dark:text-slate-200">Gs. {formatGs(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

    </div>
  );
}

// ── Dashboard Ventas ──────────────────────────────────────────────────────────

function DashVentas({
  ventas,
  productos,
  periodo,
}: {
  ventas:    VentaRaw[];
  productos: ProductoRaw[];
  periodo:   Periodo;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  const ventasFilt = useMemo(() =>
    ventas.filter(v => enRango(v.fecha, desde, hasta)),
    [ventas, desde, hasta]
  );

  const ventasHoy = useMemo(() => {
    const { desde: d, hasta: h } = getRango("hoy");
    return ventas.filter(v => enRango(v.fecha, d, h));
  }, [ventas]);

  const ventasMes = useMemo(() => {
    const { desde: d, hasta: h } = getRango("mes");
    return ventas.filter(v => enRango(v.fecha, d, h));
  }, [ventas]);

  const totalHoy   = ventasHoy.reduce((s, v) => s + v.total, 0);
  const totalMes   = ventasMes.reduce((s, v) => s + v.total, 0);
  const ticketProm = ventasFilt.length > 0 ? ventasFilt.reduce((s, v) => s + v.total, 0) / ventasFilt.length : 0;
  const unidades   = ventasFilt.flatMap(v => v.lineas ?? []).reduce((s, l) => s + (l?.cantidad ?? 0), 0);

  const prodMap = useMemo(() =>
    Object.fromEntries(productos.map(p => [p.id, p])),
    [productos]
  );

  const gananciaHoy = useMemo(() =>
    ventasHoy.flatMap(v => v.lineas ?? []).reduce((s, l) => {
      if (!l) return s;
      const costo = prodMap[l.producto_id]?.costo_promedio ?? 0;
      return s + (l.precio_venta - costo) * l.cantidad;
    }, 0),
    [ventasHoy, prodMap]
  );

  const totalHoyBruto = ventasHoy.flatMap(v => v.lineas ?? [])
    .reduce((s, l) => s + (l ? l.precio_venta * l.cantidad : 0), 0);

  const margenProm = totalHoyBruto > 0 ? (gananciaHoy / totalHoyBruto) * 100 : 0;

  const topProductos = useMemo(() => {
    const map: Record<string, number> = {};
    ventasFilt.flatMap(v => v.lineas ?? []).filter(Boolean).forEach(l => {
      map[l.producto_nombre] = (map[l.producto_nombre] ?? 0) + l.cantidad;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [ventasFilt]);

  const ventasPorHora = useMemo(() => {
    const horas = Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, "0")}h`,
      value: 0,
    }));
    ventasHoy.forEach(v => {
      const h = new Date(v.fecha).getHours();
      if (h >= 0 && h < 24) horas[h].value += v.total;
    });
    const ahora = new Date().getHours();
    return horas.slice(0, ahora + 1);
  }, [ventasHoy]);

  const desglose = useMemo(() => {
    const tipos = ["CONTADO", "CREDITO"] as const;
    return tipos.map(tipo => {
      const lst = ventasFilt.filter(v => v.tipo_venta === tipo);
      const total = lst.reduce((s, v) => s + v.total, 0);
      const unid  = lst.flatMap(v => v.lineas ?? []).reduce((s, l) => s + (l?.cantidad ?? 0), 0);
      return { tipo, ventas: lst.length, total, ticket: lst.length ? total / lst.length : 0, unid };
    });
  }, [ventasFilt]);

  return (
    <div className="space-y-5">

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="📅" label="Ventas del día"    value={`Gs. ${formatGsM(totalHoy)}`}
          sub={`${ventasHoy.length} transacciones`} color="text-blue-600" />
        <KpiCard icon="📆" label="Ventas del mes"    value={`Gs. ${formatGsM(totalMes)}`}
          sub={`${ventasMes.length} transacciones`} color="text-indigo-600" />
        <KpiCard icon="🎫" label="Ticket promedio"   value={`Gs. ${formatGsM(ticketProm)}`}
          sub={`periodo: ${periodo}`} />
        <KpiCard icon="📦" label="Unidades vendidas" value={formatGs(unidades)}
          sub={`en el periodo`} />
      </div>

      {/* KPIs rentabilidad */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${gananciaHoy >= 0 ? "text-green-600" : "text-red-600"}`}>
              Gs. {formatGsM(gananciaHoy)}
            </p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">Ganancia del día</p>
            <p className="text-xs text-gray-400">precio venta − costo promedio × cant.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${margenProm >= 20 ? "text-green-600" : margenProm >= 10 ? "text-amber-600" : "text-red-600"}`}>
              {margenProm.toFixed(1)}%
            </p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">Margen promedio (hoy)</p>
            <p className="text-xs text-gray-400">ganancia / precio venta</p>
          </div>
        </div>
      </div>

      {/* Productos más vendidos + Ventas por hora */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Productos más vendidos
          </h3>
          {topProductos.length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">Sin ventas en el periodo.</p>
            : <HBarChart data={topProductos} color="bg-indigo-400" />
          }
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Ventas por hora — hoy
          </h3>
          {ventasPorHora.every(h => h.value === 0)
            ? <p className="text-sm text-gray-400 text-center py-6">Sin ventas registradas hoy.</p>
            : <AreaChart data={ventasPorHora} color="#10b981" />
          }
        </div>
      </div>

      {/* Desglose por tipo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          Desglose por tipo de venta
        </h3>
        {ventasFilt.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin ventas en el periodo seleccionado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Tipo", "Cantidad", "Total", "Ticket promedio", "Unidades"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {desglose.map(r => (
                <tr key={r.tipo} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.tipo === "CONTADO" ? "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]" : "bg-[#E0F2FE] text-[#0284C7]"}`}>
                      {r.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-700">{r.ventas}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-gray-800">Gs. {formatGs(r.total)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">Gs. {formatGs(Math.round(r.ticket))}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">{r.unid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

const PERIODO_OPTS: { id: Periodo; label: string }[] = [
  { id: "hoy",  label: "Hoy"       },
  { id: "7d",   label: "7 días"    },
  { id: "30d",  label: "30 días"   },
  { id: "mes",  label: "Mes actual"},
  { id: "anio", label: "Año"       },
];

const TAB_VALID: TabDash[] = ["comercial", "financiero", "inventario", "ventas"];

function getInitialTab(): TabDash {
  if (typeof window === "undefined") return "comercial";
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab");
  return (t && TAB_VALID.includes(t as TabDash)) ? (t as TabDash) : "comercial";
}

export default function DashboardPage() {
  const [tab,      setTab]      = useState<TabDash>(getInitialTab);
  const [periodo,  setPeriodo]  = useState<Periodo>("mes");
  const [config,   setConfig]   = useState<ConfigGlobal | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioId, setUsuarioId] = useState<number | null>(null);

  const [prospectos,     setProspectos]     = useState<ProspectoRaw[]>([]);
  const [clientes,       setClientes]       = useState<ClienteRaw[]>([]);
  const [facturas,       setFacturas]       = useState<FacturaRaw[]>([]);
  const [pagos,          setPagos]          = useState<PagoRaw[]>([]);
  const [tipificaciones, setTipificaciones] = useState<TipificacionRaw[]>([]);
  const [productos,      setProductos]      = useState<ProductoRaw[]>([]);
  const [ventas,         setVentas]         = useState<VentaRaw[]>([]);
  const [compras,        setCompras]        = useState<CompraRaw[]>([]);
  const [gastos,         setGastos]         = useState<GastoRaw[]>([]);
  // Sincronizar tab con URL al cargar (popstate / refresh)
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t && TAB_VALID.includes(t as TabDash)) setTab(t as TabDash);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    setConfig(getConfig());
    const us = getUsuarios();
    setUsuarios(us);

    // Cargar sesión activa o default al primer admin
    const saved = localStorage.getItem("neura_dash_usuario");
    const savedId = saved ? parseInt(saved, 10) : null;
    const defaultUser = us.find(u => u.nivel === "administrador") ?? us[0] ?? null;
    setUsuarioId(savedId ?? defaultUser?.id ?? null);

    // Datos de módulos desde Supabase
    getDashboardData()
      .then((data) => {
        setProspectos(data.prospectos);
        setClientes(data.clientes);
        setFacturas(data.facturas);
        setPagos(data.pagos);
        setTipificaciones(data.tipificaciones);
        setProductos(data.productos);
        setVentas(data.ventas);
        setCompras(data.compras);
        setGastos(data.gastos);
      })
      .catch(() => {
        setProspectos([]);
        setClientes([]);
        setFacturas([]);
        setPagos([]);
        setTipificaciones([]);
        setProductos([]);
        setVentas([]);
        setCompras([]);
        setGastos([]);
      });
  }, []);

  function handleUsuarioChange(id: number) {
    setUsuarioId(id);
    localStorage.setItem("neura_dash_usuario", String(id));
  }

  const usuarioActivo = usuarios.find(u => u.id === usuarioId) ?? null;
  const nivel = usuarioActivo?.nivel ?? "administrador";

  if (!config) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center rounded-2xl py-24 text-sm"
        style={{ backgroundColor: Z.bg, color: Z.muted }}
      >
        Cargando…
      </div>
    );
  }

  // Control de acceso
  if (nivel === "usuario") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="text-4xl">🔒</span>
        <h2 className="text-lg font-bold text-gray-800">Acceso restringido</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          El dashboard solo está disponible para usuarios con nivel <strong>Supervisor</strong> o <strong>Administrador</strong>.
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
          Cambiar a:
          {usuarios.filter(u => u.nivel !== "usuario").map(u => (
            <button key={u.id} onClick={() => handleUsuarioChange(u.id)}
              className="px-3 py-1.5 rounded-lg bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-xs font-medium transition-colors">
              {u.nombre}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-8 rounded-2xl border border-white/10 px-4 py-8 sm:px-6 md:px-8"
      style={{ backgroundColor: Z.bg, color: Z.muted }}
    >
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ZentraMark />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: Z.accent }}>
              Zentra
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: Z.text }}>
              Dashboard
            </h1>
            <p className="mt-1 max-w-md text-sm leading-relaxed" style={{ color: Z.muted }}>
              Neura ERP · Vista {nivel === "supervisor" ? "de tu área" : "global"} · período alineado al filtro
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {usuarios.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:items-end">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: Z.muted }}>
                Viendo como
              </span>
              <select
                value={usuarioId ?? ""}
                onChange={(e) => handleUsuarioChange(parseInt(e.target.value, 10))}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-offset-0"
                style={{ backgroundColor: Z.surface, color: Z.text, borderColor: "rgba(255,255,255,0.12)" }}
              >
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id} style={{ backgroundColor: Z.surface }}>
                    {u.nombre} ({u.nivel})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1" style={{ backgroundColor: Z.surface }}>
            {PERIODO_OPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className="rounded-lg px-3 py-2 text-xs font-medium transition-all"
                style={
                  periodo === p.id
                    ? { backgroundColor: Z.accent, color: Z.text }
                    : { color: Z.muted, backgroundColor: "transparent" }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="flex w-full flex-wrap gap-1 rounded-2xl border border-white/10 p-1.5 sm:w-fit" style={{ backgroundColor: Z.surface }}>
        {(
          [
            { id: "comercial" as const, label: "Comercial", icon: "📊" },
            { id: "financiero" as const, label: "Financiero", icon: "💰" },
            { id: "inventario" as const, label: "Inventario", icon: "📦" },
            { id: "ventas" as const, label: "Ventas", icon: "🛒" },
          ] as { id: TabDash; label: string; icon: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (typeof window !== "undefined") window.history.replaceState(null, "", `?tab=${t.id}`);
            }}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
            style={
              tab === t.id
                ? { backgroundColor: Z.accent, color: Z.text, boxShadow: "0 8px 24px rgba(37,99,235,0.35)" }
                : { color: Z.muted }
            }
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Contenido */}
      {tab === "comercial" && (
        <DashComercial
          prospectos={prospectos}
          clientes={clientes}
          tipificaciones={tipificaciones}
          usuario={usuarioActivo}
          periodo={periodo}
          config={config}
        />
      )}

      {tab === "financiero" && (
        <DashFinanciero
          facturas={facturas}
          pagos={pagos}
          clientes={clientes}
          ventas={ventas}
          periodo={periodo}
          config={config}
        />
      )}

      {tab === "inventario" && (
        <DashInventario
          productos={productos}
          compras={compras}
        />
      )}

      {tab === "ventas" && (
        <DashVentas
          ventas={ventas}
          productos={productos}
          periodo={periodo}
        />
      )}

    </div>
  );
}
