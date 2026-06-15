"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  MessageSquare,
  Users,
  Tag,
  Star,
  CheckCircle2,
  TrendingUp,
  Inbox,
  AlertTriangle,
  X,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ymdInicioFinMesLocal, toCalendarDateStr } from "@/lib/fechas/calendario";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

type Kpis = {
  mensajes_atribuidos: number;
  conversaciones_atribuidas: number;
  leads_nuevos: number;
  tipificadas: number;
  calificadas: number;
  conversiones: number;
  tasa_conversion: number;
  tasa_conversion_tipificadas: number;
  mejor_campana: { meta_ad_id: string | null; headline: string | null; tasa: number; conversaciones: number } | null;
};
type Campana = {
  key: string;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  headline: string | null;
  source_type: string | null;
  source_url: string | null;
  image_url: string | null;
  mensajes: number;
  conversaciones: number;
  leads_nuevos: number;
  tipificadas: number;
  calificadas: number;
  conversiones: number;
  perdidas: number;
  no_respuesta: number;
  reclamos: number;
  ultima_actividad: string | null;
  tasa_conversion: number;
};
type Reporte = {
  periodo: { desde: string; hasta: string };
  kpis: Kpis;
  campanas: Campana[];
  meta: {
    tabla_atribucion_disponible: boolean;
    outcome_mapping_definido: boolean;
    canales_meta_count: number;
    conteos: { atribuciones_periodo: number; cierres_encontrados: number; mapeos_configurados: number };
    warnings: string[];
  };
};

const OUTCOMES = [
  { v: "", l: "Todos" },
  { v: "conversion", l: "Conversiones" },
  { v: "qualified_lead", l: "Calificados" },
  { v: "lost", l: "Perdidos" },
  { v: "no_response", l: "Sin respuesta" },
  { v: "claim", l: "Reclamos" },
];

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmt(n: number): string {
  return String(Math.round(Number(n) || 0).toLocaleString("es-PY"));
}
function fFecha(s: string | null): string {
  if (!s) return "—";
  const d = String(s).slice(0, 10);
  const [y, m, dd] = d.split("-");
  return dd ? `${dd}/${m}/${y}` : d;
}
function truncId(s: string | null, n = 8): string {
  if (!s) return "—";
  return s.length > n + 3 ? `${s.slice(0, n)}…` : s;
}

export default function ReporteCampanasMetaPage() {
  const mesActual = ymdInicioFinMesLocal();
  const [desde, setDesde] = useState(mesActual.inicioYmd);
  const [hasta, setHasta] = useState(mesActual.finYmd);
  const [outcome, setOutcome] = useState("");
  const [adId, setAdId] = useState("");
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillCampana, setDrillCampana] = useState<Campana | null>(null);

  const cargar = useCallback(async (d: string, h: string, oc: string, ad: string) => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (d) qs.set("desde", d);
      if (h) qs.set("hasta", h);
      if (oc) qs.set("outcome", oc);
      if (ad) qs.set("meta_ad_id", ad);
      const res = await fetchWithSupabaseSession(`/api/reportes/campanas-meta?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.success && json.data) setData(json.data as Reporte);
      else {
        setData(null);
        setError(json?.error ?? "No se pudo cargar el reporte.");
      }
    } catch {
      setData(null);
      setError("No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(mesActual.inicioYmd, mesActual.finYmd, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicar() {
    cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta), outcome, adId.trim());
  }
  function limpiar() {
    const m = ymdInicioFinMesLocal();
    setDesde(m.inicioYmd);
    setHasta(m.finYmd);
    setOutcome("");
    setAdId("");
    cargar(m.inicioYmd, m.finYmd, "", "");
  }

  const k = data?.kpis;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Reportes · Marketing</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Campañas Meta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Efectividad de campañas Meta/Facebook/Instagram según mensajes de WhatsApp, leads y tipificaciones.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          YCloud no entrega atribución de campañas Meta — este reporte solo cuenta conversaciones con referral capturado.
        </p>
      </div>

      {/* Warnings */}
      {data?.meta.warnings?.length ? (
        <div className="space-y-2">
          {data.meta.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Filtros */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="min-w-[12rem]">
            <label className={LABEL_CLS}>Outcome</label>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={INPUT_CLS}>
              {OUTCOMES.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[14rem] flex-1">
            <label className={LABEL_CLS}>Anuncio (meta_ad_id)</label>
            <input
              type="text"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              placeholder="Pegá el meta_ad_id"
              className={INPUT_CLS}
            />
          </div>
          <button
            type="button"
            onClick={aplicar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
          >
            Limpiar filtros
          </button>
          <Link
            href="/reportes"
            className="ml-auto inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Volver a Reportes
          </Link>
        </div>
        {data ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Período: {fFecha(data.periodo.desde)} — {fFecha(data.periodo.hasta)} ·{" "}
            {data.meta.canales_meta_count} canal{data.meta.canales_meta_count === 1 ? "" : "es"} Meta activos en el período.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {/* Resumen — 7 KPIs */}
      <Section title="Resumen del período">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Mensajes atribuidos" value={cargando ? "…" : fmt(k?.mensajes_atribuidos ?? 0)} />
          <Kpi icon={<Megaphone className="h-4 w-4" />} label="Conversaciones" value={cargando ? "…" : fmt(k?.conversaciones_atribuidas ?? 0)} />
          <Kpi icon={<Users className="h-4 w-4" />} label="Leads nuevos" value={cargando ? "…" : fmt(k?.leads_nuevos ?? 0)} />
          <Kpi icon={<Tag className="h-4 w-4" />} label="Tipificadas" value={cargando ? "…" : fmt(k?.tipificadas ?? 0)} />
          <Kpi icon={<Star className="h-4 w-4" />} label="Calificados" value={cargando ? "…" : fmt(k?.calificadas ?? 0)} accent="qualified" />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Conversiones" value={cargando ? "…" : fmt(k?.conversiones ?? 0)} accent="featured" />
          <Kpi
            icon={<TrendingUp className="h-4 w-4" />}
            label="Tasa de conversión"
            value={cargando ? "…" : pct(k?.tasa_conversion ?? 0)}
            sub={k && k.tipificadas > 0 ? `Sobre tipificadas: ${pct(k.tasa_conversion_tipificadas)}` : undefined}
            accent="featured"
          />
          <Kpi
            icon={<Megaphone className="h-4 w-4" />}
            label="Mejor campaña"
            value={cargando ? "…" : k?.mejor_campana ? pct(k.mejor_campana.tasa) : "—"}
            sub={k?.mejor_campana ? (k.mejor_campana.headline ?? truncId(k.mejor_campana.meta_ad_id, 10)) : undefined}
            accent="qualified"
          />
        </div>
      </Section>

      {/* Tabla por campaña */}
      <Section
        title="Detalle por anuncio"
        subtitle="Agrupado por anuncio Meta (meta_ad_id). Click en una fila para ver detalles."
      >
        {cargando ? (
          <Cargando />
        ) : !data || data.campanas.length === 0 ? (
          <Vacio msg="Todavía no hay conversaciones atribuidas a campañas Meta en este período." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full table-auto border-separate border-spacing-0 text-sm" style={{ minWidth: "1080px" }}>
                <thead className="bg-slate-50/80">
                  <tr>
                    {[
                      "Anuncio / Referral",
                      "Mensajes",
                      "Convs.",
                      "Leads",
                      "Tipif.",
                      "Calif.",
                      "Conv.",
                      "Tasa",
                      "Última act.",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 first:pl-5 last:pr-5 sm:px-4"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.campanas.map((c) => (
                    <tr
                      key={c.key}
                      className="cursor-pointer transition-colors hover:bg-[#4FAEB2]/5"
                      onClick={() => setDrillCampana(c)}
                    >
                      <td className="min-w-[16rem] px-3 py-3 first:pl-5 sm:px-4">
                        <div className="flex items-start gap-3">
                          {c.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.image_url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#4FAEB2]">
                              <Megaphone className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {c.headline ?? c.meta_ad_name ?? truncId(c.meta_ad_id, 10) ?? "Anuncio sin id"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {c.source_type ?? "ad"} · {truncId(c.meta_ad_id, 14)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.mensajes)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.conversaciones)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.leads_nuevos)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.tipificadas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-emerald-700 sm:px-4">{fmt(c.calificadas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-[#3F8E91] sm:px-4">{fmt(c.conversiones)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums sm:px-4">
                        <span className={c.tasa_conversion >= 0.2 ? "text-[#3F8E91]" : "text-slate-700"}>{pct(c.tasa_conversion)}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-500 last:pr-5 sm:px-4">{fFecha(c.ultima_actividad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Drill-down modal */}
      {drillCampana ? <DrillModal c={drillCampana} onClose={() => setDrillCampana(null)} /> : null}
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 pl-3 text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "neutral" | "featured" | "qualified";
}) {
  const chip =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "qualified"
        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const valueCls =
    accent === "featured" ? "text-[#3F8E91]" : accent === "qualified" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#4FAEB2]/45 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${chip}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight tracking-tight ${valueCls}`}>{value}</p>
          {sub ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white py-14 text-sm text-slate-500 shadow-sm">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
      Cargando…
    </div>
  );
}

function Vacio({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-14 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/8 text-[#4FAEB2]">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="max-w-md text-sm font-medium text-slate-600">{msg}</p>
    </div>
  );
}

function DrillModal({ c, onClose }: { c: Campana; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">Anuncio Meta</p>
            <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900">
              {c.headline ?? c.meta_ad_name ?? truncId(c.meta_ad_id, 16) ?? "Anuncio sin id"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm text-slate-700">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image_url}
              alt=""
              className="h-40 w-full rounded-xl object-cover ring-1 ring-slate-200"
              loading="lazy"
            />
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <dt className="text-slate-500">meta_ad_id</dt>
            <dd className="break-all font-mono text-slate-800">{c.meta_ad_id ?? "—"}</dd>
            <dt className="text-slate-500">source_type</dt>
            <dd className="text-slate-800">{c.source_type ?? "—"}</dd>
            {c.source_url ? (
              <>
                <dt className="text-slate-500">source_url</dt>
                <dd className="break-all">
                  <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[#3F8E91] hover:underline">
                    {c.source_url}
                  </a>
                </dd>
              </>
            ) : null}
            <dt className="text-slate-500">Mensajes</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fmt(c.mensajes)}</dd>
            <dt className="text-slate-500">Conversaciones</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fmt(c.conversaciones)}</dd>
            <dt className="text-slate-500">Leads nuevos</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fmt(c.leads_nuevos)}</dd>
            <dt className="text-slate-500">Tipificadas</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fmt(c.tipificadas)}</dd>
            <dt className="text-slate-500">Calificados</dt>
            <dd className="font-semibold tabular-nums text-emerald-700">{fmt(c.calificadas)}</dd>
            <dt className="text-slate-500">Conversiones</dt>
            <dd className="font-semibold tabular-nums text-[#3F8E91]">{fmt(c.conversiones)}</dd>
            <dt className="text-slate-500">Perdidas</dt>
            <dd className="font-semibold tabular-nums text-slate-700">{fmt(c.perdidas)}</dd>
            <dt className="text-slate-500">Sin respuesta</dt>
            <dd className="font-semibold tabular-nums text-slate-700">{fmt(c.no_respuesta)}</dd>
            <dt className="text-slate-500">Reclamos</dt>
            <dd className="font-semibold tabular-nums text-slate-700">{fmt(c.reclamos)}</dd>
            <dt className="text-slate-500">Tasa</dt>
            <dd className="font-semibold tabular-nums text-[#3F8E91]">{pct(c.tasa_conversion)}</dd>
            <dt className="text-slate-500">Última actividad</dt>
            <dd className="text-slate-800">{fFecha(c.ultima_actividad)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
