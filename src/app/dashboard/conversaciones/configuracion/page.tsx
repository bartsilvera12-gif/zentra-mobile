"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteChatChannel,
  fetchChatChannels,
  saveChatChannel,
  type ChatChannelRow,
  type ChatChannelFormInput,
} from "@/lib/chat/actions";

type PanelMode = "list" | "create" | "edit";

function emptyForm(): ChatChannelFormInput {
  return {
    nombre: "WhatsApp principal",
    meta_phone_number_id: "",
    provider_channel_id: "",
    activo: true,
    display_phone_number: "",
    whatsapp_access_token: "",
  };
}

function displayPhoneFromRow(row: ChatChannelRow): string {
  const v = row.config?.display_phone_number;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

export default function ConfiguracionCanalesPage() {
  const [rows, setRows] = useState<ChatChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ChatChannelFormInput>(emptyForm());
  const [panelMode, setPanelMode] = useState<PanelMode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchChatChannels();
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar canales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (panelMode === "edit" && editingId && !rows.some((r) => r.id === editingId)) {
      setPanelMode("list");
      setEditingId(null);
      setForm(emptyForm());
    }
  }, [rows, panelMode, editingId]);

  useEffect(() => {
    if (panelMode !== "list") {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [panelMode]);

  function openCreate() {
    setError(null);
    setSuccess(null);
    setEditingId(null);
    setForm(emptyForm());
    setPanelMode("create");
  }

  function startEdit(row: ChatChannelRow) {
    setError(null);
    setSuccess(null);
    setEditingId(row.id);
    setForm({
      nombre: row.nombre ?? "WhatsApp",
      meta_phone_number_id: row.meta_phone_number_id,
      provider_channel_id: row.provider_channel_id ?? row.meta_phone_number_id,
      activo: row.activo,
      display_phone_number:
        typeof row.config?.display_phone_number === "string"
          ? row.config.display_phone_number
          : "",
      whatsapp_access_token: "",
    });
    setPanelMode("edit");
  }

  function cancelForm() {
    setError(null);
    setSuccess(null);
    setEditingId(null);
    setForm(emptyForm());
    setPanelMode("list");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (panelMode === "edit") {
        if (!editingId) {
          throw new Error("No hay canal seleccionado para editar. Volvé al listado y elegí «Editar».");
        }
        await saveChatChannel({ ...form, id: editingId });
        setSuccess("Canal actualizado correctamente.");
      } else {
        await saveChatChannel(form);
        setSuccess("Canal creado correctamente.");
      }
      await reload();
      setEditingId(null);
      setForm(emptyForm());
      setPanelMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este canal? Las conversaciones asociadas pueden quedar huérfanas.")) return;
    setSaving(true);
    setSuccess(null);
    try {
      await deleteChatChannel(id);
      await reload();
      if (editingId === id) cancelForm();
      setSuccess("Canal eliminado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSaving(false);
    }
  }

  const hasChannels = rows.length > 0;
  const showForm = panelMode === "create" || panelMode === "edit";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracion" className="hover:text-slate-800">
          Configuración Global
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Conversaciones / WhatsApp</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Canales WhatsApp (Meta)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Registrá el <strong>Phone number ID</strong> de la API de Meta. Es el mismo valor que envía el webhook en{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">metadata.phone_number_id</code>.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-2">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2">
          {success}
        </div>
      )}

      <details className="bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-lg px-4 py-2 group">
        <summary className="font-medium cursor-pointer list-none flex items-center gap-2">
          <span className="group-open:rotate-90 transition-transform">▸</span>
          Demo / variables de entorno (opcional)
        </summary>
        <div className="mt-2 space-y-1 pl-5 pb-1">
          <p>
            Podés definir en Vercel:{" "}
            <code className="text-xs">WHATSAPP_DEFAULT_EMPRESA_ID</code> (UUID de tu empresa) y{" "}
            <code className="text-xs">WHATSAPP_PHONE_NUMBER_ID</code> (mismo ID que Meta). El primer webhook puede crear
            el canal automáticamente.
          </p>
        </div>
      </details>

      <div ref={formAnchorRef} />

      {showForm && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              {panelMode === "edit" ? "Editar canal" : "Nuevo canal"}
            </h2>
            <button
              type="button"
              onClick={cancelForm}
              className="text-sm text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
            >
              Volver al listado
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nombre en el ERP</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: WhatsApp ventas"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Phone number ID (Graph API) *
              </label>
              <input
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                value={form.meta_phone_number_id}
                onChange={(e) => setForm((p) => ({ ...p, meta_phone_number_id: e.target.value }))}
                placeholder="Ej: 123456789012345"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Provider channel ID (opcional)
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                value={form.provider_channel_id}
                onChange={(e) => setForm((p) => ({ ...p, provider_channel_id: e.target.value }))}
                placeholder="Por defecto se usa el mismo Phone number ID"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Número visible (opcional)
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.display_phone_number ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, display_phone_number: e.target.value }))}
                placeholder="+595 981 000000"
              />
              <p className="text-xs text-slate-400 mt-1">Se guarda en config para referencia; no afecta el webhook.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Token de acceso Meta (enviar mensajes)
              </label>
              <input
                type="password"
                autoComplete="off"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                value={form.whatsapp_access_token ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, whatsapp_access_token: e.target.value }))}
                placeholder={
                  panelMode === "edit"
                    ? "Dejar vacío para no cambiar el token guardado"
                    : "Pegá el token permanente de la app (WhatsApp)"
                }
              />
              <p className="text-xs text-slate-400 mt-1">
                Necesario para el botón Enviar en Conversaciones. Alternativa: variable{" "}
                <code className="text-[10px] bg-slate-100 px-1 rounded">WHATSAPP_TOKEN</code> en Vercel.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
              />
              Canal activo (recibe mensajes del webhook)
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0EA5E9] hover:bg-[#0284C7] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                {saving ? "Guardando…" : panelMode === "edit" ? "Actualizar canal" : "Crear canal"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelForm}
                className="border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Canales registrados</h2>
          {hasChannels && (
            <button
              type="button"
              onClick={openCreate}
              className="text-sm font-medium bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-3 py-1.5 rounded-lg"
            >
              + Nuevo canal
            </button>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Cargando…</div>
        ) : !hasChannels ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-slate-600 text-sm">Todavía no registraste ningún canal de WhatsApp.</p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              Registrar primer canal
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{r.nombre ?? "WhatsApp"}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                    <p>
                      <span className="text-slate-400">Phone number ID:</span>{" "}
                      <span className="font-mono break-all">{r.meta_phone_number_id}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">Provider:</span> {r.provider}
                    </p>
                    <p>
                      <span className="text-slate-400">Provider channel ID:</span>{" "}
                      <span className="font-mono break-all">{r.provider_channel_id ?? "—"}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">Número visible:</span> {displayPhoneFromRow(r)}
                    </p>
                  </div>
                  <p className="text-xs pt-1">
                    {r.activo ? (
                      <span className="text-emerald-700 font-medium">Activo</span>
                    ) : (
                      <span className="text-amber-700 font-medium">Inactivo</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="text-sm font-medium text-[#0EA5E9] hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
