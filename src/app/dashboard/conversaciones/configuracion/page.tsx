"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { WhatsAppChannelForm } from "@/components/chat/WhatsAppChannelForm";
import { deleteChatChannel, fetchChatChannels, type ChatChannelRow } from "@/lib/chat/actions";

type PanelMode = "list" | "create" | "edit";

function displayPhoneFromRow(row: ChatChannelRow): string {
  const v = row.config?.display_phone_number;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

export default function ConfiguracionCanalesPage() {
  const [rows, setRows] = useState<ChatChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    setPanelMode("create");
  }

  function startEdit(row: ChatChannelRow) {
    setError(null);
    setSuccess(null);
    setEditingId(row.id);
    setPanelMode("edit");
  }

  function cancelForm() {
    setError(null);
    setSuccess(null);
    setEditingId(null);
    setPanelMode("list");
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
  const editingRow = editingId ? rows.find((r) => r.id === editingId) : undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracion" className="hover:text-slate-800">
          Configuración Global
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Conversaciones / WhatsApp</span>
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        <span className="font-medium">Nueva vista de canales: </span>
        <Link href="/configuracion/canales" className="font-semibold text-[#0284C7] hover:underline">
          Canales y comunicación
        </Link>
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

          {panelMode === "edit" && editingRow ? (
            <WhatsAppChannelForm
              mode="edit"
              channelId={editingId ?? undefined}
              initialRow={editingRow}
              onCancel={cancelForm}
              onSaved={() => {
                void reload();
                cancelForm();
              }}
              submitLabelEdit="Actualizar canal"
            />
          ) : panelMode === "create" ? (
            <WhatsAppChannelForm
              mode="create"
              onCancel={cancelForm}
              onSaved={() => {
                void reload();
                cancelForm();
              }}
              submitLabelCreate="Crear canal"
            />
          ) : null}
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
