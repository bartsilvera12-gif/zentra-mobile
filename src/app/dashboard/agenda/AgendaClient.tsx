"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { AGENDA_ESTADOS, type AgendaCitaEnriquecida } from "@/lib/agenda/types";
import CitaFormModal, { type AgendaOptions } from "./components/CitaFormModal";
import CitaDetalleModal from "./components/CitaDetalleModal";
import TimeGridView from "./views/TimeGridView";
import MonthView from "./views/MonthView";
import ListView from "./views/ListView";
import {
  addDays,
  addMonths,
  estadoStyle,
  rangeForView,
  tituloPeriodo,
  type AgendaView,
} from "./calendar-utils";

type Resumen = {
  hoy: number;
  pendientes: number;
  confirmadas: number;
  completadas: number;
  canceladas_no_asistio: number;
};

const VIEWS: { key: AgendaView; label: string }[] = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "lista", label: "Listado" },
];

export default function AgendaClient() {
  const [citas, setCitas] = useState<AgendaCitaEnriquecida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [options, setOptions] = useState<AgendaOptions>({ responsables: [], clientes: [], tipos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vista de calendario
  const [view, setView] = useState<AgendaView>("semana"); // default: Semana (ver justificación en reporte)
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Filtros (sutiles)
  const [estado, setEstado] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [q, setQ] = useState("");

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"crear" | "editar" | "reprogramar">("crear");
  const [formCita, setFormCita] = useState<AgendaCitaEnriquecida | null>(null);
  const [prefill, setPrefill] = useState<{ inicio: Date; fin: Date } | null>(null);
  const [detalle, setDetalle] = useState<AgendaCitaEnriquecida | null>(null);

  const loadResumen = useCallback(async () => {
    try {
      const res = await fetchWithSupabaseSession("/api/agenda/resumen");
      const json = await res.json();
      if (json?.success) setResumen(json.data as Resumen);
    } catch {
      /* noop */
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetchWithSupabaseSession("/api/agenda/options");
      const json = await res.json();
      if (json?.success) setOptions(json.data as AgendaOptions);
    } catch {
      /* noop */
    }
  }, []);

  const loadCitas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = rangeForView(view, anchor);
      const params = new URLSearchParams();
      params.set("desde", start.toISOString());
      params.set("hasta", end.toISOString());
      if (estado) params.set("estado", estado);
      if (responsableId) params.set("responsable_id", responsableId);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetchWithSupabaseSession(`/api/agenda?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudieron cargar las citas.");
        setCitas([]);
      } else {
        setCitas(json.data as AgendaCitaEnriquecida[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error.");
    } finally {
      setLoading(false);
    }
  }, [view, anchor, estado, responsableId, q]);

  useEffect(() => {
    loadOptions();
    loadResumen();
  }, [loadOptions, loadResumen]);

  useEffect(() => {
    loadCitas();
  }, [loadCitas]);

  function refreshAll() {
    setFormOpen(false);
    setDetalle(null);
    loadCitas();
    loadResumen();
  }

  function navegar(dir: -1 | 1) {
    if (view === "mes") setAnchor((a) => addMonths(a, dir));
    else if (view === "dia") setAnchor((a) => addDays(a, dir));
    else setAnchor((a) => addDays(a, dir * 7));
  }

  function openCrear(pf?: { inicio: Date; fin: Date }) {
    setFormMode("crear");
    setFormCita(null);
    setPrefill(pf ?? null);
    setFormOpen(true);
  }
  function openCrearEn(d: Date) {
    const fin = new Date(d);
    fin.setMinutes(fin.getMinutes() + 30);
    openCrear({ inicio: d, fin });
  }
  function openEditar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("editar");
    setFormCita(c);
    setPrefill(null);
    setFormOpen(true);
  }
  function openReprogramar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("reprogramar");
    setFormCita(c);
    setPrefill(null);
    setFormOpen(true);
  }

  const stats: { label: string; value: number; dot: string }[] = [
    { label: "Hoy", value: resumen?.hoy ?? 0, dot: "bg-slate-700" },
    { label: "Pendientes", value: resumen?.pendientes ?? 0, dot: estadoStyle("pendiente").dot },
    { label: "Confirmadas", value: resumen?.confirmadas ?? 0, dot: estadoStyle("confirmada").dot },
    { label: "Completadas", value: resumen?.completadas ?? 0, dot: estadoStyle("completada").dot },
    { label: "Cancel./No asist.", value: resumen?.canceladas_no_asistio ?? 0, dot: estadoStyle("cancelada").dot },
  ];

  const selectCls =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500";

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      {/* Encabezado + métricas compactas en una fila */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Agenda</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              <span className="text-sm font-semibold text-slate-800">{s.value}</span>
              <span className="text-[11px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar tipo Google Calendar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hoy
          </button>
          <div className="flex items-center">
            <button onClick={() => navegar(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Anterior">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => navegar(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Siguiente">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <span className="ml-1 text-sm font-medium capitalize text-slate-700">{tituloPeriodo(view, anchor)}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de vista */}
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === v.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => openCrear()}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            <Plus className="h-4 w-4" /> Nueva cita
          </button>
        </div>
      </div>

      {/* Filtros sutiles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectCls}>
          <option value="">Todos los estados</option>
          {AGENDA_ESTADOS.map((s) => (
            <option key={s} value={s}>
              {estadoStyle(s).label}
            </option>
          ))}
        </select>
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={selectCls}>
          <option value="">Todos los responsables</option>
          {options.responsables.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre ?? r.id}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar título o contacto…"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 sm:max-w-xs"
        />
        {loading && <span className="text-xs text-slate-400">Cargando…</span>}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* Vista activa */}
      {view === "lista" ? (
        <ListView citas={citas} onSelect={setDetalle} />
      ) : view === "mes" ? (
        <MonthView
          anchor={anchor}
          citas={citas}
          onSelect={setDetalle}
          onCreateAt={openCrearEn}
          onVerDia={(d) => {
            setAnchor(d);
            setView("dia");
          }}
        />
      ) : (
        <TimeGridView view={view} anchor={anchor} citas={citas} onSelect={setDetalle} onCreateAt={openCrearEn} />
      )}

      <CitaFormModal
        open={formOpen}
        mode={formMode}
        cita={formCita}
        prefill={prefill}
        options={options}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
      />
      <CitaDetalleModal
        open={!!detalle}
        cita={detalle}
        onClose={() => setDetalle(null)}
        onEditar={openEditar}
        onReprogramar={openReprogramar}
        onChanged={refreshAll}
      />
    </div>
  );
}
