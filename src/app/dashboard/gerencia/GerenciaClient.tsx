"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { ComercialReport } from "@/lib/gerencia/comercial-data";

const TEAL = "#4FAEB2";
const CAT_LABEL: Record<string, string> = {
  contabilidad: "Contabilidad", saas_erp: "SaaS / ERP", web_landing: "Web / Landing",
  marketing: "Marketing", branding: "Branding", otros: "Otros", sin_clasificar: "Sin clasificar",
};
const CAT_COLOR: Record<string, string> = {
  contabilidad: "#4FAEB2", saas_erp: "#6366f1", web_landing: "#f59e0b",
  marketing: "#ec4899", branding: "#8b5cf6", otros: "#94a3b8", sin_clasificar: "#cbd5e1",
};

type Report = ComercialReport;
async function fetchReport(period: string): Promise<ComercialReport> {
  const res = await fetchWithSupabaseSession(`/api/gerencia/comercial?period=${period}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

const gs = (n: number) => "Gs " + Math.round(n || 0).toLocaleString("es-PY");
const gsShort = (n: number) => {
  const v = Math.abs(n || 0);
  if (v >= 1e9) return "Gs " + (n / 1e9).toFixed(1) + "MM";
  if (v >= 1e6) return "Gs " + (n / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "Gs " + (n / 1e3).toFixed(0) + "K";
  return "Gs " + Math.round(n || 0);
};
const pct = (p: number | null) => (p == null ? "—" : (p > 0 ? "+" : "") + p.toFixed(1) + "%");
const pctColor = (p: number | null) => (p == null ? "text-slate-400" : p > 0 ? "text-emerald-600" : p < 0 ? "text-rose-600" : "text-slate-500");

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function GerenciaClient() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null);
    try { setData(await fetchReport(p)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const periodOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 8; i++) { opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); }
    return opts;
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gerencia</h1>
          <p className="text-sm text-slate-500">Reportería comercial · ventas, revenue y MRR</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-[#4FAEB2] focus:outline-none">
          {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </header>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">No se pudo cargar: {error}</div>}
      {loading && <div className="py-20 text-center text-slate-400">Cargando…</div>}

      {data && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Facturado del mes" value={gsShort(data.kpis.facturado_mes)} sub={pct(data.kpis.variacion_facturado_pct)} subColor={pctColor(data.kpis.variacion_facturado_pct)} accent />
            <Kpi label="Cobrado del mes" value={gsShort(data.kpis.cobrado_mes)} sub={pct(data.kpis.variacion_cobrado_pct)} subColor={pctColor(data.kpis.variacion_cobrado_pct)} />
            <Kpi label="Pendiente de cobro" value={gsShort(data.kpis.pendiente_cobro)} sub="cuentas por cobrar" />
            <Kpi label="MRR" value={gsShort(data.kpis.mrr)} sub={`${data.mrr.subs_activas} subs activas`} accent />
            <Kpi label="Ticket promedio" value={gsShort(data.kpis.ticket_promedio)} sub={`${data.kpis.facturas_mes} facturas`} />
            <Kpi label="Variación vs mes ant." value={pct(data.kpis.variacion_facturado_pct)} sub="facturado" subColor={pctColor(data.kpis.variacion_facturado_pct)} />
          </div>

          {/* A igual día + chart */}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">A igual día del mes (1–{data.igual_dia.dia})</h2>
              <div className="mt-3 space-y-2">
                <Row label="Este mes" value={gs(data.igual_dia.facturado_actual)} strong />
                <Row label="Mes anterior" value={gs(data.igual_dia.facturado_anterior)} />
                <div className="border-t border-slate-100 pt-2">
                  <Row label="Diferencia" value={gs(data.igual_dia.diff)} extra={<span className={pctColor(data.igual_dia.diff_pct)}>{pct(data.igual_dia.diff_pct)}</span>} strong />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Facturado vs Cobrado (últimos meses)</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.serie_mensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis tickFormatter={(v) => gsShort(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} width={70} />
                  <Tooltip formatter={(v: number) => gs(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="facturado_total" name="Facturado" fill={TEAL} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cobrado_total" name="Cobrado" fill="#a7d8db" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue por categoría */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Revenue por categoría (mes {data.period})</h2>
            <CategoryBars rows={data.revenue_por_categoria} />
          </div>

          {/* MRR por categoría */}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">MRR por categoría</h2>
              <CategoryBars rows={data.mrr.por_categoria.map((m) => ({ categoria: m.categoria, facturado: m.mrr, facturas: m.subs_activas }))} unitLabel="subs" />
            </div>
            <Table title="Top clientes del mes" cols={["Cliente", "Facturado", "Facturas"]}
              rows={data.top_clientes.map((c) => [c.cliente, gs(c.facturado), String(c.facturas)])} empty="Sin facturación este mes" />
          </div>

          {/* Tablas */}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Table title="Clientes recurrentes" cols={["Cliente", "Meses", "Prom.", "Categoría"]}
              rows={data.clientes_recurrentes.map((c) => [c.cliente, String(c.meses), gsShort(c.promedio), CAT_LABEL[c.categoria || "sin_clasificar"] || c.categoria || "—"])} empty="—" />
            <Table title="Pendientes de cobro" cols={["Cliente", "Factura", "Saldo", "Atraso"]}
              rows={data.pendientes_cobro.map((c) => [c.cliente, c.numero_factura || "—", gs(c.saldo), c.dias_atraso == null ? "—" : `${c.dias_atraso}d`])} empty="Sin pendientes" />
          </div>

          <div className="mt-5">
            <Table title="Recurrentes SIN facturar este mes (alerta de churn)" cols={["Cliente", "Último mes", "Categoría"]}
              rows={data.recurrentes_sin_facturar_mes.map((c) => [c.cliente, c.ultimo, CAT_LABEL[c.categoria || "sin_clasificar"] || "—"])} empty="Todos los recurrentes facturaron este mes ✓" />
          </div>
          <p className="mt-4 text-xs text-slate-400">Moneda: Guaraníes (Gs). Anulación por estado de factura. Generado {new Date(data.generated_at).toLocaleString("es-PY")}.</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, subColor, accent }: { label: string; value: string; sub?: string; subColor?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${accent ? "border-[#4FAEB2]/40" : "border-slate-200"}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${subColor || "text-slate-400"}`}>{sub}</div>}
    </div>
  );
}
function Row({ label, value, extra, strong }: { label: string; value: string; extra?: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-bold text-slate-800" : "text-slate-600"} flex items-center gap-2`}>{value}{extra}</span>
    </div>
  );
}
function CategoryBars({ rows, unitLabel = "fact" }: { rows: { categoria: string; facturado: number; facturas: number }[]; unitLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.facturado));
  if (!rows.length) return <p className="text-sm text-slate-400">Sin datos</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.categoria}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">{CAT_LABEL[r.categoria] || r.categoria}</span>
            <span className="text-slate-500">{gsShort(r.facturado)} · {r.facturas} {unitLabel}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(r.facturado / max) * 100}%`, background: CAT_COLOR[r.categoria] || TEAL }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Table({ title, cols, rows, empty }: { title: string; cols: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-slate-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400">{cols.map((c) => <th key={c} className="pb-2 font-medium">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 12).map((row, i) => (
                <tr key={i} className="text-slate-600">{row.map((cell, j) => <td key={j} className={`py-1.5 ${j === 0 ? "font-medium text-slate-700" : ""}`}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
