"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  ProyectoModuloSelector,
  type ProyectoModuloCatalogo as ModuloCatalogo,
} from "@/app/dashboard/proyectos/components/ProyectoModuloSelector";
import {
  PROYECTO_DATOS_BRIEF_FIELDS,
  applyBriefFormToExisting,
  applySaasFormToExisting,
  coalesceBriefData,
  formatFechaPyFull,
  readSaasBriefData,
  type ProyectoModuloSnapshot,
  type ProyectoSaasBriefForm,
} from "@/lib/proyectos/brief-data";

export type DetalleResp = {
  proyecto: Record<string, unknown> & {
    id: string;
    titulo?: string;
    brief_data?: Record<string, unknown>;
    tipo_id?: string;
    estado_id?: string;
    proyecto_tipo?: { codigo?: string };
  };
  historial: Record<string, unknown>[];
  sla: Record<string, unknown>;
  tareas: Record<string, unknown>[];
  comentarios: Record<string, unknown>[];
  archivos: Record<string, unknown>[];
  avance_pct: number | null;
};

type UsuarioActivo = { id: string; nombre?: string | null; email?: string | null };

const TAB_IDS = ["resumen", "datos", "tareas", "comentarios", "archivos", "historial"] as const;
export type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  resumen: "Resumen",
  datos: "Datos",
  tareas: "Tareas",
  comentarios: "Comentarios",
  archivos: "Archivos",
  historial: "Historial",
};

function normalizeTab(raw: string | null | undefined): TabId {
  if (!raw) return "resumen";
  if (raw === "brief") return "datos";
  return (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : "resumen";
}

function clienteNombre(p: Record<string, unknown>): string {
  const c = p.cliente as { empresa?: string | null; nombre_contacto?: string | null } | undefined;
  if (!c) return "—";
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

function prioridadLabel(value: unknown): string {
  if (value === "normal") return "Media";
  if (value === "baja") return "Baja";
  if (value === "alta") return "Alta";
  if (value === "urgente") return "Urgente";
  return value == null ? "—" : String(value);
}

export type ProyectoDetalleInnerProps = {
  projectId: string;
  variant: "page" | "modal";
  onClose?: () => void;
  onProjectUpdated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export default function ProyectoDetalleInner({
  projectId,
  variant,
  onClose,
  onProjectUpdated,
  onDirtyChange,
}: ProyectoDetalleInnerProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabUrl = variant === "page" ? normalizeTab(sp?.get("tab")) : null;
  const [modalTab, setModalTab] = useState<TabId>("resumen");

  const tab = variant === "page" ? (tabUrl ?? "resumen") : modalTab;

  const setTab = useCallback(
    (t: TabId) => {
      if (variant === "modal") setModalTab(t);
      else router.replace(`/dashboard/proyectos/${projectId}?tab=${t}`);
    },
    [variant, router, projectId]
  );

  const [data, setData] = useState<DetalleResp | null>(null);
  const [estados, setEstados] = useState<{ id: string; nombre: string }[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioActivo[]>([]);
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [comTexto, setComTexto] = useState("");
  const [tareaTitulo, setTareaTitulo] = useState("");

  const [briefForm, setBriefForm] = useState<Record<string, string>>({});
  const [saasForm, setSaasForm] = useState<ProyectoSaasBriefForm>({
    empresa_nombre: "",
    whatsapp_contacto: "",
    observaciones: "",
    modulos_necesarios: [],
  });
  const [responsableTecnicoId, setResponsableTecnicoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [datosSnapshot, setDatosSnapshot] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; data?: DetalleResp; error?: string };
    if (!res.ok || !j.success || !j.data) {
      setErr(j.error ?? "Error al cargar");
      setLoading(false);
      return;
    }
    setData(j.data);
    const p = j.data.proyecto;
    const merged = coalesceBriefData(p.brief_data);
    const saas = readSaasBriefData(p.brief_data);
    setBriefForm(merged);
    setSaasForm(saas);
    setResponsableTecnicoId(typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "");
    setObservaciones(typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "");
    setDatosSnapshot(JSON.stringify({
      bf: merged,
      saas,
      responsable_tecnico_id: typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "",
      obs: typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "",
    }));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (variant !== "page" || !projectId) return;
    const raw = sp?.get("tab");
    if (raw === "brief") {
      router.replace(`/dashboard/proyectos/${projectId}?tab=datos`);
    }
  }, [variant, projectId, sp, router]);

  useEffect(() => {
    let c = false;
    (async () => {
      const [r, rUsers, rModulos] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/modulos-catalogo", { cache: "no-store" }),
      ]);
      const j = (await r.json()) as { success?: boolean; data?: { id: string; nombre: string }[] };
      const jUsers = (await rUsers.json()) as { usuarios?: UsuarioActivo[] };
      const jModulos = (await rModulos.json()) as { success?: boolean; data?: ModuloCatalogo[] };
      if (!c && j.success && j.data) setEstados(j.data);
      if (!c) setUsuarios(jUsers.usuarios ?? []);
      if (!c && jModulos.success && jModulos.data) setModulosCatalogo(jModulos.data);
    })();
    return () => {
      c = true;
    };
  }, []);

  const datosDirty = useMemo(() => {
    const cur = JSON.stringify({
      bf: briefForm,
      saas: saasForm,
      responsable_tecnico_id: responsableTecnicoId,
      obs: observaciones,
    });
    return datosSnapshot !== "" && cur !== datosSnapshot;
  }, [briefForm, saasForm, responsableTecnicoId, observaciones, datosSnapshot]);

  useEffect(() => {
    onDirtyChange?.(datosDirty);
  }, [datosDirty, onDirtyChange]);

  async function guardarDatos() {
    const proyecto = data?.proyecto;
    if (!proyecto) return;
    const tipoCodigo = proyecto.proyecto_tipo?.codigo ?? "";
    const briefMerged =
      tipoCodigo === "saas"
        ? applySaasFormToExisting(proyecto.brief_data, saasForm)
        : applyBriefFormToExisting(proyecto.brief_data, briefForm);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief_data: briefMerged,
        responsable_tecnico_id: responsableTecnicoId || null,
        observaciones_comerciales: observaciones.trim() === "" ? null : observaciones.trim(),
      }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "No se pudo guardar");
      return;
    }
    await load();
    onProjectUpdated?.();
  }

  async function agregarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!comTexto.trim()) return;
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario: comTexto.trim() }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "Error");
      return;
    }
    setComTexto("");
    await load();
    onProjectUpdated?.();
  }

  async function agregarTarea(e: React.FormEvent) {
    e.preventDefault();
    if (!tareaTitulo.trim()) return;
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: tareaTitulo.trim() }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "Error");
      return;
    }
    setTareaTitulo("");
    await load();
    onProjectUpdated?.();
  }

  async function patchTarea(tareaId: string, patch: Record<string, unknown>) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  async function cambiarEstado(estadoId: string) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/cambiar-estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_id: estadoId }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  const slaFmt = useMemo(() => {
    const s = data?.sla as { segundos_interno?: number; segundos_cliente?: number; segundos_pausado?: number } | undefined;
    if (!s) return null;
    const fmt = (sec?: number) =>
      sec == null ? "—" : `${Math.round((sec / 3600) * 10) / 10} h`;
    return {
      interno: fmt(s.segundos_interno),
      cliente: fmt(s.segundos_cliente),
      pausado: fmt(s.segundos_pausado),
    };
  }, [data?.sla]);

  const proyecto = data?.proyecto;
  const codigoTipo = proyecto?.proyecto_tipo?.codigo ?? "";
  const esWeb = codigoTipo === "web";
  const esSaas = codigoTipo === "saas";
  const briefCoerced = coalesceBriefData(proyecto?.brief_data);
  const saasModuloIds = saasForm.modulos_necesarios
    .map((modulo) => modulo.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const updateSaasField = <K extends keyof ProyectoSaasBriefForm>(key: K, value: ProyectoSaasBriefForm[K]) => {
    setSaasForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateSaasModulos = (ids: string[]) => {
    const snapshots: ProyectoModuloSnapshot[] = modulosCatalogo
      .filter((modulo) => ids.includes(modulo.id))
      .map((modulo) => ({ id: modulo.id, slug: modulo.slug, nombre: modulo.nombre }));
    updateSaasField("modulos_necesarios", snapshots);
  };

  if (!projectId) return null;
  if (loading && !data) {
    return <div className="p-8 text-sm text-slate-500">Cargando…</div>;
  }
  if (err && !data) return <div className="p-8 text-sm text-rose-600">{err}</div>;
  if (!data || !proyecto) return null;

  const panelCls =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const labelCls = "text-xs font-medium uppercase tracking-wide text-slate-500";
  const inputCls =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
  const selectCls =
    "mt-1.5 w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px_14px] bg-[right_0.85rem_center] bg-no-repeat px-3.5 py-2.5 pr-9 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
  const chevronStyle = {
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
  } as const;

  const rootClass =
    variant === "modal"
      ? "flex h-full min-h-0 flex-col bg-white"
      : "mx-auto max-w-5xl space-y-6 p-6";

  return (
    <div className={rootClass}>
      {variant === "page" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/proyectos"
            className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Kanban
          </Link>
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-6 pb-5 pt-6"
            : "flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4"
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Proyecto
            </p>
          </div>
          <h1
            id={variant === "modal" ? "proyecto-detalle-titulo" : undefined}
            className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900"
          >
            {String(proyecto.titulo ?? "")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {(proyecto as { proyecto_tipo?: { nombre?: string } }).proyecto_tipo?.nombre ?? "—"} ·{" "}
            <span className="text-slate-600">Avance {data.avance_pct ?? "—"}%</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              className={selectCls}
              style={chevronStyle}
              value={String(proyecto.estado_id ?? "")}
              onChange={(e) => void cambiarEstado(e.target.value)}
              aria-label="Cambiar estado"
            >
              {estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          {variant === "modal" ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => onClose?.()}
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => router.push("/dashboard/proyectos")}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {err ? (
        <div
          className={
            variant === "modal"
              ? "mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
              : "rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
          }
        >
          {err}
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap gap-1.5 border-b border-slate-100 bg-white px-6 pb-3 pt-4"
            : "flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
        }
      >
        {TAB_IDS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91] shadow-sm"
                  : "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div
        className={
          variant === "modal"
            ? "min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : ""
        }
      >
        {tab === "resumen" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Resumen del proyecto</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Cliente</dt>
                  <dd className="text-right font-medium text-slate-900">{clienteNombre(proyecto)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Vendedor / comercial</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_comercial?: { nombre?: string } }).responsable_comercial?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Técnico responsable</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_tecnico?: { nombre?: string } }).responsable_tecnico?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Fecha prometida</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {proyecto.fecha_prometida != null && String(proyecto.fecha_prometida).trim() !== ""
                      ? formatFechaPyFull(String(proyecto.fecha_prometida))
                      : "—"}
                  </dd>
                </div>
                {esSaas ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Empresa SaaS / ERP</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.empresa_nombre.trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Módulos necesarios</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.modulos_necesarios.length > 0
                          ? saasForm.modulos_necesarios.map((m) => m.nombre).join(", ")
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>WhatsApp contacto</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.whatsapp_contacto.trim() || "—"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Nombre de la marca</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.marca || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Dominio a usar</dt>
                      <dd className="max-w-[55%] break-all text-right font-medium text-slate-900">
                        {(briefCoerced.dominio_usar || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Tipo de web</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.tipo_web || "").trim() || "—"}
                      </dd>
                    </div>
                  </>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className={labelCls}>Prioridad</dt>
                  <dd className="text-right font-medium text-slate-900">{prioridadLabel(proyecto.prioridad)}</dd>
                </div>
              </dl>
            </div>
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">SLA acumulado</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Tiempo interno</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.interno}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Espera cliente</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.cliente}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Pausado</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.pausado}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {tab === "datos" ? (
          <div className={`space-y-5 ${panelCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <h2 className="text-sm font-semibold text-slate-900">Datos del proyecto</h2>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Editá los campos guardados en el proyecto. Los datos previos se conservan al guardar.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!datosDirty}
                onClick={() => void guardarDatos()}
              >
                Guardar datos
              </button>
            </div>

            {esWeb ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;Proyecto Web&quot;: campos adicionales del brief comercial.
              </p>
            ) : null}
            {esSaas ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;SaaS / ERP&quot;: snapshot de módulos requeridos, sin activar permisos ni módulos reales.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={labelCls}>Técnico responsable</span>
                <select
                  className={selectCls}
                  style={chevronStyle}
                  value={responsableTecnicoId}
                  onChange={(e) => setResponsableTecnicoId(e.target.value)}
                >
                  <option value="">—</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email || u.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              {esWeb ? (
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones comerciales</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalle adicional negociado con el cliente…"
                  />
                </label>
              ) : null}
            </div>

            {esWeb ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {PROYECTO_DATOS_BRIEF_FIELDS.map((f) =>
                  f.kind === "checkbox" ? (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors hover:border-[#4FAEB2]/60"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                        checked={briefForm[f.key] === "1"}
                        onChange={(e) =>
                          setBriefForm((b) => ({ ...b, [f.key]: e.target.checked ? "1" : "" }))
                        }
                      />
                      {f.label}
                    </label>
                  ) : (
                    <label key={f.key} className={`block text-sm ${f.key === "secciones" ? "sm:col-span-2" : ""}`}>
                      <span className={labelCls}>{f.label}</span>
                      <input
                        className={inputCls}
                        placeholder={f.placeholder}
                        value={briefForm[f.key] ?? ""}
                        onChange={(e) => setBriefForm((b) => ({ ...b, [f.key]: e.target.value }))}
                      />
                    </label>
                  )
                )}
              </div>
            ) : null}

            {esSaas ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className={labelCls}>Nombre de la empresa</span>
                  <input
                    className={inputCls}
                    value={saasForm.empresa_nombre}
                    onChange={(e) => updateSaasField("empresa_nombre", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelCls}>WhatsApp contacto</span>
                  <input
                    className={inputCls}
                    placeholder="+595..."
                    value={saasForm.whatsapp_contacto}
                    onChange={(e) => updateSaasField("whatsapp_contacto", e.target.value)}
                  />
                </label>
                <div className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Módulos necesarios</span>
                  <div className="mt-1.5">
                    <ProyectoModuloSelector
                      modulos={modulosCatalogo}
                      selectedIds={saasModuloIds}
                      onChange={updateSaasModulos}
                    />
                  </div>
                </div>
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={saasForm.observaciones}
                    onChange={(e) => updateSaasField("observaciones", e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {Object.keys(briefCoerced).length === 0 &&
            !observaciones.trim() ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Todavía no hay datos cargados. Completá el formulario y guardá.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "tareas" ? (
          <div className={`space-y-4 ${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Tareas</h2>
            </div>
            <form onSubmit={agregarTarea} className="flex flex-wrap gap-2">
              <input
                className={`min-w-[200px] flex-1 ${inputCls}`}
                placeholder="Nueva tarea"
                value={tareaTitulo}
                onChange={(e) => setTareaTitulo(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
              >
                Agregar
              </button>
            </form>
            <ul className="divide-y divide-slate-100">
              {(data.tareas ?? []).map((t) => {
                const tid = String(t.id ?? "");
                const estado = String(t.estado ?? "");
                return (
                  <li key={tid} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                    <span className="flex-1 font-medium text-slate-800">{String(t.titulo ?? "")}</span>
                    <select
                      className="appearance-none rounded-lg border border-slate-200 bg-white bg-[length:12px_12px] bg-[right_0.6rem_center] bg-no-repeat px-3 py-1.5 pr-7 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
                      style={chevronStyle}
                      value={estado}
                      onChange={(e) => void patchTarea(tid, { estado: e.target.value })}
                    >
                      <option value="pendiente">pendiente</option>
                      <option value="en_proceso">en_proceso</option>
                      <option value="completada">completada</option>
                      <option value="bloqueada">bloqueada</option>
                    </select>
                  </li>
                );
              })}
              {(data.tareas ?? []).length === 0 ? (
                <li className="py-6 text-center text-xs text-slate-400">Sin tareas registradas.</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {tab === "comentarios" ? (
          <div className={`space-y-4 ${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Comentarios internos</h2>
            </div>
            <form onSubmit={agregarComentario} className="space-y-2">
              <textarea
                className={`${inputCls} min-h-[88px]`}
                rows={3}
                placeholder="Comentario interno"
                value={comTexto}
                onChange={(e) => setComTexto(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
              >
                Publicar
              </button>
            </form>
            <ul className="space-y-3">
              {(data.comentarios ?? []).map((c) => (
                <li
                  key={String(c.id)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="font-medium text-[#4FAEB2]">
                      {String((c as { usuario_nombre?: string }).usuario_nombre ?? "")}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>{formatFechaPyFull(String(c.created_at ?? ""))}</span>
                  </div>
                  <div className="mt-1.5 text-slate-700">{String(c.comentario ?? "")}</div>
                </li>
              ))}
              {(data.comentarios ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay comentarios.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {tab === "archivos" ? (
          <div className={`${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Archivos del proyecto</h2>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Registro en base de datos listo; subida a almacenamiento en una siguiente iteración.
            </p>
            <ul className="mt-4 space-y-2">
              {(data.archivos ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Sin archivos registrados.
                </li>
              ) : (
                (data.archivos ?? []).map((a) => (
                  <li
                    key={String(a.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm"
                  >
                    <span className="font-medium text-slate-800">{String(a.nombre ?? "")}</span>
                    <span className="text-xs text-slate-500">{formatFechaPyFull(String(a.created_at ?? ""))}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {tab === "historial" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Estado anterior</th>
                    <th className="px-3 py-2.5">Estado nuevo</th>
                    <th className="px-3 py-2.5">Tipo SLA</th>
                    <th className="px-3 py-2.5">Entrada</th>
                    <th className="px-3 py-2.5">Salida</th>
                    <th className="px-3 py-2.5">Duración</th>
                    <th className="px-3 py-2.5">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.historial ?? []).map((h) => {
                    const hr = h as Record<string, unknown>;
                    const ant =
                      (hr.estado_anterior_nombre as string | undefined) ??
                      (hr.estado_anterior_id ? String(hr.estado_anterior_id) : "—");
                    const nue =
                      (hr.estado_nuevo_nombre as string | undefined) ??
                      String(hr.estado_nuevo_id ?? "—");
                    const slaL =
                      (hr.tipo_sla_label as string | undefined) ??
                      String(hr.tipo_sla_snapshot ?? "—");
                    const usr = (hr.usuario_cambio_label as string | undefined) ?? "No registrado";
                    const dur =
                      (hr.duration_label as string | undefined) ??
                      (hr.duration_seconds != null ? String(hr.duration_seconds) + " s" : "—");
                    return (
                      <tr key={String(h.id)} className="text-slate-700 hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-xs">{ant}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-900">{nue}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{slaL}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {formatFechaPyFull(String(h.entered_at ?? ""))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {h.exited_at ? formatFechaPyFull(String(h.exited_at)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{dur}</td>
                        <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500" title={usr}>
                          {usr}
                        </td>
                      </tr>
                    );
                  })}
                  {(data.historial ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">
                        Sin historial registrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
