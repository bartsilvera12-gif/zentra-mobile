"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ComprobanteValidationConfigSection } from "@/components/chat/ComprobanteValidationConfigSection";
import {
  comprobanteValidationSettingsForForm,
  defaultComprobanteValidationSettings,
  parseComprobanteValidationConfig,
  type ComprobanteValidationSettings,
} from "@/lib/chat/comprobante-validation-types";
import {
  saveChatChannel,
  type ChatChannelFormInput,
  type ChatChannelRow,
} from "@/lib/chat/actions";

export function emptyWhatsAppChannelForm(): ChatChannelFormInput {
  return {
    nombre: "WhatsApp principal",
    meta_phone_number_id: "",
    provider_channel_id: "",
    activo: true,
    display_phone_number: "",
    whatsapp_access_token: "",
  };
}

function rowToForm(row: ChatChannelRow): ChatChannelFormInput {
  return {
    nombre: row.nombre ?? "WhatsApp",
    meta_phone_number_id: row.meta_phone_number_id,
    provider_channel_id: row.provider_channel_id ?? row.meta_phone_number_id,
    activo: row.activo,
    display_phone_number:
      typeof row.config?.display_phone_number === "string" ? row.config.display_phone_number : "",
    whatsapp_access_token: "",
  };
}

export type WhatsAppChannelFormProps = {
  mode: "create" | "edit";
  /** En edición, id del canal */
  channelId?: string;
  /** Fila cargada del servidor (edit) */
  initialRow?: ChatChannelRow | null;
  /** Navegación al cancelar (si no se usa onCancel) */
  cancelHref?: string;
  /** Cancelar embebido (p. ej. panel en otra página) */
  onCancel?: () => void;
  onSaved?: (channelId: string) => void;
  submitLabelCreate?: string;
  submitLabelEdit?: string;
};

export function WhatsAppChannelForm({
  mode,
  channelId,
  initialRow,
  cancelHref = "/configuracion/canales",
  onCancel,
  onSaved,
  submitLabelCreate = "Crear canal",
  submitLabelEdit = "Guardar cambios",
}: WhatsAppChannelFormProps) {
  const [form, setForm] = useState<ChatChannelFormInput>(() =>
    mode === "edit" && initialRow ? rowToForm(initialRow) : emptyWhatsAppChannelForm()
  );
  const [cvSettings, setCvSettings] = useState<ComprobanteValidationSettings>(() =>
    mode === "edit" && initialRow
      ? parseComprobanteValidationConfig(initialRow.config)
      : defaultComprobanteValidationSettings()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && initialRow) {
      setForm(rowToForm(initialRow));
      setCvSettings(parseComprobanteValidationConfig(initialRow.config));
    }
  }, [mode, initialRow]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "edit") {
        if (!channelId?.trim()) {
          throw new Error("Canal no válido.");
        }
        const id = await saveChatChannel({
          ...form,
          id: channelId.trim(),
          comprobante_validation: comprobanteValidationSettingsForForm(cvSettings),
        });
        setSuccess("Cambios guardados.");
        onSaved?.(id);
      } else {
        const id = await saveChatChannel({
          ...form,
          comprobante_validation: comprobanteValidationSettingsForForm(cvSettings),
        });
        setSuccess("Canal creado.");
        onSaved?.(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-2">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2">
          {success}
        </div>
      )}

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
              mode === "edit"
                ? "Dejar vacío para no cambiar el token guardado"
                : "Pegá el token permanente de la app (WhatsApp)"
            }
          />
          <p className="text-xs text-slate-400 mt-1">
            Necesario para enviar desde Conversaciones. Alternativa: variable{" "}
            <code className="text-[10px] bg-slate-100 px-1 rounded">WHATSAPP_TOKEN</code> en el servidor.
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

        <ComprobanteValidationConfigSection value={cvSettings} onChange={setCvSettings} />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
          >
            {saving ? "Guardando…" : mode === "edit" ? submitLabelEdit : submitLabelCreate}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              Volver al listado
            </button>
          ) : (
            <Link
              href={cancelHref}
              className="inline-flex items-center border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              Volver
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
