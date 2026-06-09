"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { createBrowserClientForSchema } from "@/lib/supabase";
import { readSaasBriefData } from "@/lib/proyectos/brief-data";
import ProyectoDetalleModal from "./components/ProyectoDetalleModal";
import ProyectoNuevoModal from "./components/ProyectoNuevoModal";
import { FancySelect } from "./components/FancySelect";

type EstadoRow = {
  id: string;
  nombre: string;
  codigo: string;
  color: string;
  sort_order: number;
  cuenta_sla?: boolean;
  sla_horas_objetivo?: number | null;
  es_estado_final?: boolean;
  inactiveFallback?: boolean;
};

type ProyectoCard = Record<string, unknown> & {
  id: string;
  titulo: string;
  prioridad: string;
  estado_id: string;
  last_activity_at?: string;
  fecha_ingreso?: string;
  fecha_prometida?: string | null;
  brief_data?: Record<string, unknown> | null;
  bloqueado?: boolean;
  archivado?: boolean;
  proyecto_tipo?: { nombre?: string; codigo?: string } | null;
  proyecto_estado?: {
    nombre?: string;
    codigo?: string;
    color?: string;
    cuenta_sla?: boolean;
    sla_horas_objetivo?: number | null;
    es_estado_final?: boolean;
  } | null;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  responsable_comercial?: { nombre?: string | null } | null;
  responsable_tecnico?: { nombre?: string | null } | null;
  tiempo_en_estado_segundos?: number | null;
  estado_actual_desde?: string | null;
  sla_estado_actual?: {
    cuenta_sla: boolean;
    objetivo_horas: number | null;
    vencido: boolean;
    restante_segundos: number | null;
    excedido_segundos: number | null;
  };
};

const ESTADO_ENTREGADO_CODIGO = "publicado";
const POSTENTREGA_PERIODO_DIAS = 30;

function isEntregado(p: ProyectoCard): boolean {
  return (p.proyecto_estado?.codigo ?? "").toLowerCase() === ESTADO_ENTREGADO_CODIGO;
}

type PostentregaInfo = {
  dia: number;
  total: number;
  vencido: boolean;
  diasRestantes: number;
};

function getPostentregaInfo(p: ProyectoCard): PostentregaInfo | null {
  if (!isEntregado(p)) return null;
  const desde = p.estado_actual_desde;
  if (!desde) return null;
  const desdeMs = Date.parse(desde);
  if (!Number.isFinite(desdeMs)) return null;
  const diffMs = Date.now() - desdeMs;
  const diaActual = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
  const vencido = diaActual > POSTENTREGA_PERIODO_DIAS;
  return {
    dia: diaActual,
    total: POSTENTREGA_PERIODO_DIAS,
    vencido,
    diasRestantes: Math.max(0, POSTENTREGA_PERIODO_DIAS - diaActual + 1),
  };
}

type PrioridadConfig = {
  codigo: string;
  nombre: string;
  color: string | null;
  bg_color: string | null;
  text_color: string | null;
  border_color: string | null;
  sort_order: number;
  activo: boolean;
};

type ProjectCardViewProps = {
  p: ProyectoCard;
  estados: EstadoRow[];
  estadoActivoIds: Set<string>;
  prioridadConfig?: PrioridadConfig;
  onOpen: (id: string) => void;
  onMove: (proyectoId: string, estadoId: string) => void;
  moving?: boolean;
  dragOverlay?: boolean;
};

type KanbanColumnViewProps = {
  col: EstadoRow;
  children: ReactNode;
};

const PROJECT_DRAG_PREFIX = "project:";
const COLUMN_DROP_PREFIX = "estado:";

function projectDragId(projectId: string): string {
  return `${PROJECT_DRAG_PREFIX}${projectId}`;
}

function estadoDropId(estadoId: string): string {
  return `${COLUMN_DROP_PREFIX}${estadoId}`;
}

function readProjectIdFromDragId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(PROJECT_DRAG_PREFIX) ? raw.slice(PROJECT_DRAG_PREFIX.length) : null;
}

function readEstadoIdFromDropId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(COLUMN_DROP_PREFIX) ? raw.slice(COLUMN_DROP_PREFIX.length) : null;
}

type PriorityCardStyles = {
  cardAccentClass: string;
  badgeClass: string;
  iconDotClass: string;
};

function getPriorityCardStyles(prioridad: string | null | undefined): PriorityCardStyles {
  if (prioridad === "baja") {
    return {
      cardAccentClass: "border-l-emerald-500 hover:border-emerald-200",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconDotClass: "bg-emerald-500",
    };
  }
  if (prioridad === "alta") {
    return {
      cardAccentClass: "border-l-orange-500 hover:border-orange-200",
      badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
      iconDotClass: "bg-orange-500",
    };
  }
  if (prioridad === "urgente") {
    return {
      cardAccentClass: "border-l-rose-600 hover:border-rose-200",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      iconDotClass: "bg-rose-600",
    };
  }
  if (prioridad === "normal" || prioridad === "media") {
    return {
      cardAccentClass: "border-l-sky-500 hover:border-sky-200",
      badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
      iconDotClass: "bg-sky-500",
    };
  }
  return {
    cardAccentClass: "border-l-slate-300 hover:border-slate-300",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    iconDotClass: "bg-slate-400",
  };
}

function prioridadFallbackLabel(p: string): string {
  if (p === "normal") return "Media";
  if (p === "alta") return "Alta";
  if (p === "urgente") return "Urgente";
  if (p === "baja") return "Baja";
  return p;
}

function formatSlaDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const totalHours = Math.max(0, Math.floor(seconds / 3600));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

function formatSlaTarget(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  return formatSlaDuration(hours * 3600);
}

function slaEstadoLabel(p: ProyectoCard): string {
  const sla = p.sla_estado_actual;
  if (!sla?.cuenta_sla) return "SLA —";
  if (sla.vencido) return `SLA vencido: +${formatSlaDuration(sla.excedido_segundos)}`;
  const elapsed = formatSlaDuration(p.tiempo_en_estado_segundos);
  const target = formatSlaTarget(sla.objetivo_horas);
  return target ? `SLA: ${elapsed} / ${target}` : `SLA: ${elapsed}`;
}

function saasModuleCountLabel(p: ProyectoCard): string | null {
  if (p.proyecto_tipo?.codigo !== "saas") return null;
  const count = readSaasBriefData(p.brief_data).modulos_necesarios.length;
  if (count <= 0) return null;
  return count === 1 ? "1 módulo" : `${count} módulos`;
}

export default function ProyectosKanbanClient({ dataSchema }: { dataSchema: string }) {
  const [estados, setEstados] = useState<EstadoRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoCard[]>([]);
  const [prioridadesConfig, setPrioridadesConfig] = useState<PrioridadConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [activeDragProjectId, setActiveDragProjectId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroRc, setFiltroRc] = useState("");
  const [filtroRt, setFiltroRt] = useState("");
  const [tipoOpts, setTipoOpts] = useState<{ id: string; nombre: string }[]>([]);
  const [userOpts, setUserOpts] = useState<{ id: string; nombre?: string }[]>([]);
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [nuevoModalOpen, setNuevoModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (filtroEstado) sp.set("estado_id", filtroEstado);
    if (filtroTipo) sp.set("tipo_id", filtroTipo);
    if (filtroRc) sp.set("responsable_comercial_id", filtroRc);
    if (filtroRt) sp.set("responsable_tecnico_id", filtroRt);

    const [rEst, rPr, rTipos, rUsers, rPrioridades] = await Promise.all([
      fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
      fetchWithSupabaseSession(`/api/proyectos?${sp.toString()}`, { cache: "no-store" }),
      fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" }),
      fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
      fetchWithSupabaseSession("/api/configuracion/proyectos/prioridades", { cache: "no-store" }),
    ]);

    const jEst = (await rEst.json().catch(() => ({}))) as { success?: boolean; data?: EstadoRow[]; error?: string };
    const jPr = (await rPr.json().catch(() => ({}))) as { success?: boolean; data?: ProyectoCard[]; error?: string };
    const jTipos = (await rTipos.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { id: string; nombre: string }[];
    };
    const jUsers = (await rUsers.json().catch(() => ({}))) as { usuarios?: { id: string; nombre?: string }[] };
    const jPrioridades = (await rPrioridades.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { prioridades?: PrioridadConfig[] };
    };

    if (!rEst.ok || !jEst.success) {
      setErr(jEst.error ?? "No se pudieron cargar estados");
      setLoading(false);
      return;
    }
    if (!rPr.ok || !jPr.success) {
      setErr(jPr.error ?? "No se pudieron cargar proyectos");
      setLoading(false);
      return;
    }
    setEstados(jEst.data ?? []);
    setProyectos(jPr.data ?? []);

    if (jTipos.success && jTipos.data) setTipoOpts(jTipos.data);
    if (jUsers.usuarios) setUserOpts(jUsers.usuarios);
    if (rPrioridades.ok && jPrioridades.success && jPrioridades.data?.prioridades) {
      setPrioridadesConfig(jPrioridades.data.prioridades);
    } else {
      setPrioridadesConfig([]);
    }

    setLoading(false);
  }, [q, filtroEstado, filtroTipo, filtroRc, filtroRt]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: cualquier cambio en proyectos del tenant refresca el Kanban.
  // proyecto_tareas también dispara re-fetch porque afecta el avance %.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!dataSchema) return;
    const sb = createBrowserClientForSchema(dataSchema);

    const channel = sb
      .channel("proyectos-kanban")
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyectos" },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_tareas" },
        () => void loadRef.current?.()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [dataSchema]);

  const estadoActivoIds = useMemo(() => new Set(estados.map((e) => e.id)), [estados]);

  const kanbanColumns = useMemo(() => {
    const columns = [...estados];
    const missing = new Map<string, EstadoRow>();
    for (const p of proyectos) {
      if (estadoActivoIds.has(p.estado_id) || missing.has(p.estado_id)) continue;
      missing.set(p.estado_id, {
        id: p.estado_id,
        nombre: `Oculto / no usado: ${p.proyecto_estado?.nombre ?? "Estado sin configurar"}`,
        codigo: p.proyecto_estado?.codigo ?? "estado_inactivo",
        color: p.proyecto_estado?.color ?? "#94a3b8",
        sort_order: 9999,
        inactiveFallback: true,
      });
    }
    return [...columns, ...missing.values()];
  }, [estadoActivoIds, estados, proyectos]);

  const byColumn = useMemo(() => {
    const m = new Map<string, ProyectoCard[]>();
    for (const e of kanbanColumns) m.set(e.id, []);
    for (const p of proyectos) {
      const col = m.get(p.estado_id);
      if (col) col.push(p);
    }
    return m;
  }, [kanbanColumns, proyectos]);

  const prioridadByCodigo = useMemo(() => {
    const m = new Map<string, PrioridadConfig>();
    for (const prioridad of prioridadesConfig) {
      if (prioridad.activo) m.set(prioridad.codigo, prioridad);
    }
    return m;
  }, [prioridadesConfig]);

  const activeDragProject = useMemo(
    () => proyectos.find((p) => p.id === activeDragProjectId) ?? null,
    [activeDragProjectId, proyectos]
  );

  async function cambiarEstado(proyectoId: string, estadoId: string): Promise<boolean> {
    if (!estadoActivoIds.has(estadoId)) {
      setErr("No se puede mover a una columna inactiva.");
      return false;
    }

    const currentProject = proyectos.find((p) => p.id === proyectoId);
    if (!currentProject) {
      setErr("No se encontró el proyecto a mover.");
      return false;
    }
    if (currentProject.estado_id === estadoId) return true;

    const previousProjects = proyectos;
    const destino = estados.find((e) => e.id === estadoId);
    setErr(null);
    setMovingProjectId(proyectoId);
    setProyectos((prev) =>
      prev.map((p) =>
        p.id === proyectoId
          ? {
              ...p,
              estado_id: estadoId,
              proyecto_estado: destino
                ? {
                    ...(p.proyecto_estado ?? {}),
                    nombre: destino.nombre,
                    codigo: destino.codigo,
                    color: destino.color,
                    cuenta_sla: destino.cuenta_sla,
                    sla_horas_objetivo: destino.sla_horas_objetivo,
                    es_estado_final: destino.es_estado_final ?? p.proyecto_estado?.es_estado_final,
                  }
                : p.proyecto_estado,
            }
          : p
      )
    );

    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${proyectoId}/cambiar-estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_id: estadoId }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setProyectos(previousProjects);
        setErr(j.error ?? "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior.");
        setMovingProjectId(null);
        return false;
      }
      setMovingProjectId(null);
      await load();
      return true;
    } catch (e) {
      setProyectos(previousProjects);
      setErr(
        e instanceof Error
          ? `${e.message}. La tarjeta volvió a su columna anterior.`
          : "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior."
      );
      setMovingProjectId(null);
      return false;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragProjectId(readProjectIdFromDragId(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const proyectoId = readProjectIdFromDragId(event.active.id);
    const estadoId = readEstadoIdFromDropId(event.over?.id);
    setActiveDragProjectId(null);

    if (!proyectoId || !estadoId) return;
    void cambiarEstado(proyectoId, estadoId);
  }

  if (loading && proyectos.length === 0 && estados.length === 0) {
    return <div className="p-6 text-sm text-slate-500">Cargando proyectos…</div>;
  }

  if (err && proyectos.length === 0) {
    return <div className="p-6 text-sm text-red-600">{err}</div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Tablero
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500">Kanban configurable por empresa — producción, clientes y SLA.</p>
        </div>
        <button
          type="button"
          onClick={() => setNuevoModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo proyecto
        </button>
      </div>

      {err ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div> : null}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full gap-3">
          {estados.map((estado) => (
            <EstadoMetric
              key={estado.id}
              label={estado.nombre}
              value={byColumn.get(estado.id)?.length ?? 0}
              color={estado.color}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:flex-wrap xl:items-center">
        <div className="relative min-w-[220px] flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#4FAEB2]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            placeholder="Buscar título o cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          onClick={() => void load()}
        >
          Buscar
        </button>
        <FancySelect
          className="min-w-[180px] shrink-0"
          ariaLabel="Filtrar por estado"
          placeholder="Todos los estados"
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: "", label: "Todos los estados" },
            ...estados.map((e) => ({ value: e.id, label: e.nombre })),
          ]}
        />
        <FancySelect
          className="min-w-[160px] shrink-0"
          ariaLabel="Filtrar por tipo"
          placeholder="Todos los tipos"
          value={filtroTipo}
          onChange={setFiltroTipo}
          options={[
            { value: "", label: "Todos los tipos" },
            ...tipoOpts.map((t) => ({ value: t.id, label: t.nombre })),
          ]}
        />
        <FancySelect
          className="min-w-[190px] shrink-0"
          ariaLabel="Filtrar por responsable comercial"
          placeholder="Resp. comercial"
          value={filtroRc}
          onChange={setFiltroRc}
          options={[
            { value: "", label: "Resp. comercial" },
            ...userOpts.map((u) => ({
              value: u.id,
              label: u.nombre ?? u.id.slice(0, 8),
            })),
          ]}
        />
        <FancySelect
          className="min-w-[190px] shrink-0"
          ariaLabel="Filtrar por responsable técnico"
          placeholder="Resp. técnico"
          value={filtroRt}
          onChange={setFiltroRt}
          options={[
            { value: "", label: "Resp. técnico" },
            ...userOpts.map((u) => ({
              value: u.id,
              label: u.nombre ?? u.id.slice(0, 8),
            })),
          ]}
        />
        {(q || filtroEstado || filtroTipo || filtroRc || filtroRt) ? (
          <button
            type="button"
            className="shrink-0 rounded-xl border border-transparent px-3 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              setQ("");
              setFiltroEstado("");
              setFiltroTipo("");
              setFiltroRc("");
              setFiltroRt("");
            }}
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="max-h-[calc(100vh-260px)] min-h-[520px] overflow-auto rounded-xl pb-4">
          <div className="flex min-h-full gap-4">
            {kanbanColumns.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              return (
                <KanbanColumnView key={col.id} col={col}>
                  <div
                    className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 shadow-sm"
                    style={{ borderTopColor: col.color, borderTopWidth: 3 }}
                  >
                    <span className="text-sm font-semibold text-slate-800">{col.nombre}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{items.length}</span>
                  </div>
                  {col.inactiveFallback ? (
                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Esta columna está inactiva, pero contiene proyectos. Movelos a una columna activa.
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.map((p) => (
                      <ProjectCardView
                        key={p.id}
                        p={p}
                        estados={estados}
                        estadoActivoIds={estadoActivoIds}
                        prioridadConfig={prioridadByCodigo.get(p.prioridad)}
                        onOpen={setModalProjectId}
                        onMove={(proyectoId, estadoId) => void cambiarEstado(proyectoId, estadoId)}
                        moving={movingProjectId === p.id}
                      />
                    ))}
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">Soltá tarjetas acá</div>
                    ) : null}
                  </div>
                </KanbanColumnView>
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeDragProject ? (
            <ProjectCardView
              p={activeDragProject}
              estados={estados}
              estadoActivoIds={estadoActivoIds}
              prioridadConfig={prioridadByCodigo.get(activeDragProject.prioridad)}
              onOpen={() => undefined}
              onMove={() => undefined}
              dragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-center text-xs text-slate-400">
        Arrastrá tarjetas entre columnas activas o usá el selector “Mover a” como alternativa.
      </p>

      <ProyectoDetalleModal
        projectId={modalProjectId}
        open={modalProjectId != null}
        onClose={() => setModalProjectId(null)}
        onUpdated={() => void load()}
        dataSchema={dataSchema}
      />

      <ProyectoNuevoModal
        open={nuevoModalOpen}
        onClose={() => setNuevoModalOpen(false)}
        onCreated={(id) => {
          setNuevoModalOpen(false);
          void load();
          setModalProjectId(id);
        }}
      />
    </div>
  );
}

function KanbanColumnView({ col, children }: KanbanColumnViewProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: estadoDropId(col.id),
    disabled: col.inactiveFallback === true,
    data: { estadoId: col.id, active: col.inactiveFallback !== true },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl border bg-slate-50/80 transition-colors ${
        isOver && !col.inactiveFallback
          ? "border-[#4FAEB2]/50 bg-[#4FAEB2]/8 ring-2 ring-[#4FAEB2]/20"
          : "border-slate-200"
      }`}
    >
      {children}
    </div>
  );
}

function ProjectCardView({
  p,
  estados,
  estadoActivoIds,
  prioridadConfig,
  onOpen,
  onMove,
  moving,
  dragOverlay,
}: ProjectCardViewProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: projectDragId(p.id),
    disabled: dragOverlay === true,
    data: { projectId: p.id, estadoId: p.estado_id },
  });

  const cli =
    (p.cliente?.empresa || "").trim() ||
    (p.cliente?.nombre_contacto || "").trim() ||
    "Sin cliente";
  const saasModulesLabel = saasModuleCountLabel(p);
  const priorityStyles = getPriorityCardStyles(p.prioridad);
  const postentrega = getPostentregaInfo(p);

  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const baseBadgeClass =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4";
  const neutralBadgeClass =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-slate-600";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none rounded-2xl border border-l-4 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        dragOverlay ? "rotate-1 cursor-grabbing shadow-2xl" : "cursor-grab active:cursor-grabbing"
      } ${priorityStyles.cardAccentClass} ${isDragging ? "opacity-40" : ""} ${moving ? "ring-2 ring-sky-100" : ""}`}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => {
          if (!dragOverlay) onOpen(p.id);
        }}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityStyles.iconDotClass}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug text-slate-950 hover:underline">
              {p.titulo}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-600">
              {cli}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={neutralBadgeClass}>
            {p.proyecto_tipo?.nombre ?? "Tipo"}
          </span>
          {saasModulesLabel ? (
            <span className={neutralBadgeClass}>
              {saasModulesLabel}
            </span>
          ) : null}
          <span className={`${baseBadgeClass} font-semibold ${priorityStyles.badgeClass}`}>
            {prioridadConfig?.nombre ?? prioridadFallbackLabel(p.prioridad)}
          </span>
          <span className={p.sla_estado_actual?.vencido ? `${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-700` : neutralBadgeClass}>
            {slaEstadoLabel(p)}
          </span>
          {postentrega ? (
            <span
              className={`${baseBadgeClass} font-semibold ${
                postentrega.vencido
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : postentrega.dia >= 25
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
              }`}
              title={
                postentrega.vencido
                  ? `Período de cambios cerrado (día ${postentrega.dia})`
                  : `Día ${postentrega.dia} de ${postentrega.total} para cambios gratis`
              }
            >
              {postentrega.vencido
                ? `Día ${postentrega.dia} / ${postentrega.total} · vencido`
                : `Día ${postentrega.dia} / ${postentrega.total}`}
            </span>
          ) : null}
          {p.bloqueado ? (
            <span className={`${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-800`}>
              Bloqueado
            </span>
          ) : null}
          {moving ? (
            <span className={`${baseBadgeClass} border-sky-200 bg-sky-50 text-sky-800`}>
              Guardando...
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-700">
          <MetaItem label="Com." value={p.responsable_comercial?.nombre ?? "—"} />
          <MetaItem label="Téc." value={p.responsable_tecnico?.nombre ?? "—"} />
          <MetaItem label="Ingreso" value={fmtDate(p.fecha_ingreso)} />
          <MetaItem label="Prometido" value={fmtDate(p.fecha_prometida)} />
          <div className="col-span-2">
            <MetaItem label="Actividad" value={fmtDateTime(p.last_activity_at)} />
          </div>
        </div>
      </button>
      {!dragOverlay ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
            <Link
              href={`/dashboard/proyectos/${p.id}`}
              className="text-[11px] font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir en página completa
            </Link>
          </div>
          <div
            className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Mover a
            </label>
            <div className="mt-1">
              <FancySelect
                size="sm"
                ariaLabel="Mover a otro estado"
                value={p.estado_id}
                onChange={(v) => onMove(p.id, v)}
                options={[
                  ...(!estadoActivoIds.has(p.estado_id)
                    ? [
                        {
                          value: p.estado_id,
                          label: "Estado actual oculto / no usado",
                          disabled: true,
                        },
                      ]
                    : []),
                  ...estados.map((e) => ({ value: e.id, label: e.nombre })),
                ]}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="font-semibold text-slate-500">{label}</span>{" "}
      <span className="break-words text-slate-800">{value}</span>
    </div>
  );
}

function EstadoMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="min-w-[190px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="mb-2 h-1 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500" title={label}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "—";
}

function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}
