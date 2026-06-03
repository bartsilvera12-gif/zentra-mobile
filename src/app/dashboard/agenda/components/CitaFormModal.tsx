"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";

export type AgendaOptions = {
  responsables: { id: string; nombre: string | null; rol: string | null }[];
  clientes: { id: string; nombre: string | null; telefono: string | null }[];
  tipos: string[];
};

type Mode = "crear" | "editar" | "reprogramar";

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function localInputToIso(v: string): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400";
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

export default function CitaFormModal({
  open,
  mode,
  cita,
  options,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  cita: AgendaCitaEnriquecida | null;
  options: AgendaOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [tipo, setTipo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAviso(null);
    if (mode === "crear") {
      setTitulo("");
      setResponsableId(options.responsables[0]?.id ?? "");
      setClienteId("");
      setContactoNombre("");
      setContactoTelefono("");
      setTipo("");
      setInicio("");
      setFin("");
      setUbicacion("");
      setObservaciones("");
    } else if (cita) {
      setTitulo(mode === "reprogramar" ? cita.titulo : cita.titulo);
      setResponsableId(cita.responsable_id);
      setClienteId(cita.cliente_id ?? "");
      setContactoNombre(cita.contacto_nombre ?? "");
      setContactoTelefono(cita.contacto_telefono ?? "");
      setTipo(cita.tipo ?? "");
      setInicio(isoToLocalInput(cita.inicio_at));
      setFin(isoToLocalInput(cita.fin_at));
      setUbicacion(cita.ubicacion ?? "");
      setObservaciones(cita.observaciones ?? "");
    }
  }, [open, mode, cita, options.responsables]);

  // Chequeo de disponibilidad (advertencia, no bloqueante en el form).
  useEffect(() => {
    if (!open) return;
    const inicioIso = localInputToIso(inicio);
    const finIso = localInputToIso(fin);
    if (!responsableId || !inicioIso || !finIso || Date.parse(finIso) <= Date.parse(inicioIso)) {
      setAviso(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ responsable_id: responsableId, inicio: inicioIso, fin: finIso });
    if (mode === "editar" && cita) params.set("exclude_id", cita.id);
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithSupabaseSession(`/api/agenda/disponibilidad?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data?.disponible === false) {
          setAviso(json.data.conflicto?.mensaje ?? "El responsable ya tiene una cita en ese horario.");
        } else {
          setAviso(null);
        }
      } catch {
        /* silencioso */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, responsableId, inicio, fin, mode, cita]);

  const tituloModal = useMemo(() => {
    if (mode === "crear") return "Nueva cita";
    if (mode === "reprogramar") return "Reprogramar cita";
    return "Editar cita";
  }, [mode]);

  if (!open) return null;

  async function submit() {
    setError(null);
    const inicioIso = localInputToIso(inicio);
    const finIso = localInputToIso(fin);
    if (mode !== "reprogramar" && !titulo.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (!responsableId) {
      setError("Elegí un responsable.");
      return;
    }
    if (!inicioIso || !finIso) {
      setError("Indicá fecha/hora de inicio y fin.");
      return;
    }
    if (Date.parse(finIso) <= Date.parse(inicioIso)) {
      setError("El fin debe ser posterior al inicio.");
      return;
    }

    setSaving(true);
    try {
      let res: Response;
      if (mode === "crear") {
        res = await fetchWithSupabaseSession("/api/agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            responsable_id: responsableId,
            cliente_id: clienteId || null,
            contacto_nombre: contactoNombre || null,
            contacto_telefono: contactoTelefono || null,
            tipo: tipo || null,
            inicio_at: inicioIso,
            fin_at: finIso,
            ubicacion: ubicacion || null,
            observaciones: observaciones || null,
          }),
        });
      } else if (mode === "reprogramar" && cita) {
        res = await fetchWithSupabaseSession(`/api/agenda/${cita.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "reprogramar",
            responsable_id: responsableId,
            inicio_at: inicioIso,
            fin_at: finIso,
            observaciones: observaciones || null,
          }),
        });
      } else if (cita) {
        res = await fetchWithSupabaseSession(`/api/agenda/${cita.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            responsable_id: responsableId,
            cliente_id: clienteId || null,
            contacto_nombre: contactoNombre || null,
            contacto_telefono: contactoTelefono || null,
            tipo: tipo || null,
            inicio_at: inicioIso,
            fin_at: finIso,
            ubicacion: ubicacion || null,
            observaciones: observaciones || null,
          }),
        });
      } else {
        setSaving(false);
        return;
      }

      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo guardar.");
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{tituloModal}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
          {mode !== "reprogramar" && (
            <div>
              <label className={labelCls}>Título *</label>
              <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Demo con cliente" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Responsable *</label>
              <select className={inputCls} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                <option value="">— Elegir —</option>
                {options.responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre ?? r.id}
                  </option>
                ))}
              </select>
            </div>
            {mode !== "reprogramar" && (
              <div>
                <label className={labelCls}>Tipo</label>
                <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">— Sin tipo —</option>
                  {options.tipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Inicio *</label>
              <input type="datetime-local" className={inputCls} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fin *</label>
              <input type="datetime-local" className={inputCls} value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
          </div>

          {aviso && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {aviso}
            </div>
          )}

          {mode !== "reprogramar" && (
            <>
              <div>
                <label className={labelCls}>Cliente</label>
                <select className={inputCls} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— Sin cliente (contacto manual) —</option>
                  {options.clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre ?? c.id}
                    </option>
                  ))}
                </select>
              </div>
              {!clienteId && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Contacto (nombre)</label>
                    <input className={inputCls} value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Contacto (teléfono)</label>
                    <input className={inputCls} value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className={labelCls}>Ubicación / enlace</label>
                <input className={inputCls} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Dirección, sala o link" />
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>Observaciones internas</label>
            <textarea className={inputCls} rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
