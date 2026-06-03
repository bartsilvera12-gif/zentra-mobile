"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { AGENDA_ESTADOS, type AgendaCitaEnriquecida } from "@/lib/agenda/types";
import CitaFormModal, { type AgendaOptions } from "./components/CitaFormModal";
import CitaDetalleModal from "./components/CitaDetalleModal";

const TZ = "America/Asuncion";

type Resumen = {
  hoy: number;
  pendientes: number;
  confirmadas: number;
  completadas: number;
  canceladas_no_asistio: number;
};

function estadoBadge(estado: string): { cls: string; label: string } {
  switch (estado) {
    case "pendiente":
      return { cls: "border-amber-200 bg-amber-50 text-amber-700", label: "Pendiente" };
    case "confirmada":
      return { cls: "border-sky-200 bg-sky-50 text-sky-700", label: "Confirmada" };
    case "completada":
      return { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Completada" };
    case "no_asistio":
      return { cls: "border-orange-200 bg-orange-50 text-orange-700", label: "No asistió" };
    case "cancelada":
      return { cls: "border-rose-200 bg-rose-50 text-rose-700", label: "Cancelada" };
    case "reprogramada":
      return { cls: "border-violet-200 bg-violet-50 text-violet-700", label: "Reprogramada" };
    default:
      return { cls: "border-slate-200 bg-slate-50 text-slate-600", label: estado };
  }
}

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}
function dayHeader(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PY", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PY", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AgendaClient() {
  const [citas, setCitas] = useState<AgendaCitaEnriquecida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [options, setOptions] = useState<AgendaOptions>({ responsables: [], clientes: [], tipos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [desde, setDesde] = useState(todayPlus(0));
  const [hasta, setHasta] = useState(todayPlus(14));
  const [estado, setEstado] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [q, setQ] = useState("");

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"crear" | "editar" | "reprogramar">("crear");
  const [formCita, setFormCita] = useState<AgendaCitaEnriquecida | null>(null);
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
      const params = new URLSearchParams();
      if (desde) params.set("desde", new Date(`${desde}T00:00:00`).toISOString());
      if (hasta) params.set("hasta", new Date(`${hasta}T23:59:59`).toISOString());
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
  }, [desde, hasta, estado, responsableId, q]);

  useEffect(() => {
    loadOptions();
    loadResumen();
  }, [loadOptions, loadResumen]);

  useEffect(() => {
    loadCitas();
  }, [loadCitas]);

  const grupos = useMemo(() => {
    const map = new Map<string, AgendaCitaEnriquecida[]>();
    for (const c of citas) {
      const k = dayKey(c.inicio_at);
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [citas]);

  function refreshAll() {
    setFormOpen(false);
    setDetalle(null);
    loadCitas();
    loadResumen();
  }

  function openCrear() {
    setFormMode("crear");
    setFormCita(null);
    setFormOpen(true);
  }
  function openEditar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("editar");
    setFormCita(c);
    setFormOpen(true);
  }
  function openReprogramar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("reprogramar");
    setFormCita(c);
    setFormOpen(true);
  }

  const cards: { label: string; value: number; cls: string }[] = [
    { label: "Citas de hoy", value: resumen?.hoy ?? 0, cls: "text-slate-800" },
    { label: "Pendientes", value: resumen?.pendientes ?? 0, cls: "text-amber-600" },
    { label: "Confirmadas", value: resumen?.confirmadas ?? 0, cls: "text-sky-600" },
    { label: "Completadas", value: resumen?.completadas ?? 0, cls: "text-emerald-600" },
    { label: "Canceladas / No asistió", value: resumen?.canceladas_no_asistio ?? 0, cls: "text-rose-600" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Agenda</h1>
          <p className="text-sm text-slate-500">Citas, turnos y reuniones</p>
        </div>
        <button onClick={openCrear} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
          + Nueva cita
        </button>
      </div>

      {/* Métricas */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className={`text-2xl font-semibold ${c.cls}`}>{c.value}</div>
            <div className="mt-1 text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Filtro label="Desde">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="filtro-input w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </Filtro>
        <Filtro label="Hasta">
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </Filtro>
        <Filtro label="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {AGENDA_ESTADOS.map((s) => (
              <option key={s} value={s}>
                {estadoBadge(s).label}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Responsable">
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {options.responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre ?? r.id}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Buscar">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título o contacto" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </Filtro>
      </div>

      {/* Listado */}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Cargando…</div>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">
          No hay citas en el rango seleccionado.
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([k, items]) => (
            <div key={k}>
              <h3 className="mb-2 text-sm font-semibold capitalize text-slate-600">{dayHeader(items[0].inicio_at)}</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {items.map((c, i) => {
                  const badge = estadoBadge(c.estado);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setDetalle(c)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${i > 0 ? "border-t border-slate-100" : ""}`}
                    >
                      <div className="w-24 shrink-0 text-sm font-medium text-slate-700">
                        {hora(c.inicio_at)}–{hora(c.fin_at)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{c.titulo}</div>
                        <div className="truncate text-xs text-slate-500">
                          {(c.cliente?.nombre ?? c.contacto_nombre ?? "Sin cliente")}
                          {c.responsable?.nombre ? ` · ${c.responsable.nombre}` : ""}
                          {c.tipo ? ` · ${c.tipo}` : ""}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <CitaFormModal
        open={formOpen}
        mode={formMode}
        cita={formCita}
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

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
