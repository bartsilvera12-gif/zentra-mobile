"use client";

import type {
  ComprobanteValidationSettings,
  OcrFieldKey,
  OnMissingBehavior,
} from "@/lib/chat/comprobante-validation-types";
import { defaultComprobanteValidationSettings } from "@/lib/chat/comprobante-validation-types";

const OCR_FIELD_LABELS: Record<OcrFieldKey, string> = {
  monto: "Monto",
  referencia: "Referencia / Nº operación",
  fecha: "Fecha",
  hora: "Hora",
  banco: "Banco",
  texto_completo: "Texto OCR completo",
};

function OnMissingSelect(props: {
  value: OnMissingBehavior;
  onChange: (v: OnMissingBehavior) => void;
}) {
  return (
    <select
      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as OnMissingBehavior)}
    >
      <option value="continuar">Permitir continuar</option>
      <option value="revision_manual">Revisión manual</option>
      <option value="bloquear">Bloquear (mensaje + botones)</option>
    </select>
  );
}

export function ComprobanteValidationConfigSection(props: {
  value: ComprobanteValidationSettings;
  onChange: (next: ComprobanteValidationSettings) => void;
}) {
  const s = props.value;
  const set = (patch: Partial<ComprobanteValidationSettings>) =>
    props.onChange({ ...s, ...patch });
  const setMsg = (patch: Partial<ComprobanteValidationSettings["messages"]>) =>
    props.onChange({ ...s, messages: { ...s.messages, ...patch } });
  const setField = (key: OcrFieldKey, patch: Partial<(typeof s.ocr_fields)[OcrFieldKey]>) =>
    props.onChange({
      ...s,
      ocr_fields: { ...s.ocr_fields, [key]: { ...s.ocr_fields[key], ...patch } },
    });

  return (
    <div className="mt-8 pt-6 border-t border-slate-200 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
          Validación de comprobantes
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Aplica a comprobantes recibidos en flujos con nodo de imagen (ej. sorteos). Requiere{" "}
          <code className="text-[10px] bg-slate-100 px-1 rounded">GOOGLE_CLOUD_VISION_API_KEY</code> en
          el servidor para OCR.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Activar validación inteligente en este canal
      </label>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Monto del comprobante vs monto elegido en el flujo
        </h4>
        <p className="text-[11px] text-slate-500">
          Opcional: compara el monto leído por OCR con el valor guardado en{" "}
          <code className="bg-white px-0.5 rounded">chat_flow_data</code> del{" "}
          <strong>mismo</strong> <code className="bg-white px-0.5 rounded">flow_session_id</code>. Si está
          desactivado, el comportamiento es el de siempre.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.validar_monto_vs_flujo}
            onChange={(e) => set({ validar_monto_vs_flujo: e.target.checked })}
          />
          Validar monto OCR contra el monto del flujo (opt-in)
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Tolerancia absoluta (Gs)
            </label>
            <input
              type="number"
              min={0}
              max={1_000_000_000}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={s.monto_tolerancia_absoluta_gs}
              onChange={(e) =>
                set({ monto_tolerancia_absoluta_gs: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Prioridad de campos en <code className="text-[10px]">chat_flow_data</code> (coma)
            </label>
            <input
              type="text"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono bg-white"
              value={s.monto_fields_prioridad.join(", ")}
              onChange={(e) => {
                const next = e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .slice(0, 20);
                set({
                  monto_fields_prioridad:
                    next.length > 0 ? next : [...defaultComprobanteValidationSettings().monto_fields_prioridad],
                });
              }}
              placeholder="monto, monto_compra, sorteo_monto_opcion"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.deteccion_duplicados_hash}
            onChange={(e) => set({ deteccion_duplicados_hash: e.target.checked })}
          />
          Detección de duplicados por hash
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.ocr_obligatorio}
            onChange={(e) => set({ ocr_obligatorio: e.target.checked })}
          />
          OCR obligatorio (resultado legible)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.bloquear_por_hash_duplicado}
            onChange={(e) => set({ bloquear_por_hash_duplicado: e.target.checked })}
          />
          Bloquear si el hash ya existe
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.bloquear_por_ocr_duplicado}
            onChange={(e) => set({ bloquear_por_ocr_duplicado: e.target.checked })}
          />
          Bloquear duplicado detectado por OCR
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.revision_manual_si_sospecha_ocr}
            onChange={(e) => set({ revision_manual_si_sospecha_ocr: e.target.checked })}
          />
          Revisión manual si el OCR es sospechosamente corto
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s.revision_manual_activar_takeover}
            onChange={(e) => set({ revision_manual_activar_takeover: e.target.checked })}
          />
          En revisión manual, pasar conversación a modo humano (takeover)
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
            Mín. caracteres OCR (sospecha)
          </label>
          <input
            type="number"
            min={0}
            max={500}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={s.ocr_min_chars_sospecha}
            onChange={(e) => set({ ocr_min_chars_sospecha: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
            Si falla OCR / PDF sin OCR automático
          </label>
          <OnMissingSelect
            value={s.ocr_fallo_comportamiento}
            onChange={(v) => set({ ocr_fallo_comportamiento: v })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Mensajes ante situaciones
        </h4>
        {(
          [
            ["hash_duplicado", "Hash duplicado"],
            ["ocr_duplicado", "OCR / datos duplicados"],
            ["monto_incoherente", "Monto no coincide con la opción elegida"],
            ["revision_manual", "Revisión manual"],
            ["ocr_insuficiente", "OCR insuficiente o error"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[64px]"
              value={s.messages[key]}
              onChange={(e) => setMsg({ [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Botón «otro comprobante» (máx. 20 caracteres)
            </label>
            <input
              maxLength={20}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={s.messages.boton_otro_titulo}
              onChange={(e) => setMsg({ boton_otro_titulo: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Botón «asesor» (máx. 20 caracteres)
            </label>
            <input
              maxLength={20}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={s.messages.boton_asesor_titulo}
              onChange={(e) => setMsg({ boton_asesor_titulo: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Campos OCR (reglas por campo)
        </h4>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-2 py-2 font-semibold text-slate-600">Campo</th>
                <th className="px-2 py-2 font-semibold text-slate-600">Analizar</th>
                <th className="px-2 py-2 font-semibold text-slate-600">Duplicado</th>
                <th className="px-2 py-2 font-semibold text-slate-600">Obligatorio</th>
                <th className="px-2 py-2 font-semibold text-slate-600 min-w-[160px]">
                  Si falta
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.keys(OCR_FIELD_LABELS) as OcrFieldKey[]).map((key) => {
                const r = s.ocr_fields[key];
                return (
                  <tr key={key} className="bg-white">
                    <td className="px-2 py-2 font-medium text-slate-800">{OCR_FIELD_LABELS[key]}</td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={r.analyzed}
                        onChange={(e) => setField(key, { analyzed: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={r.use_duplicate_detection}
                        onChange={(e) => setField(key, { use_duplicate_detection: e.target.checked })}
                        disabled={!r.analyzed}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={r.required}
                        onChange={(e) => setField(key, { required: e.target.checked })}
                        disabled={!r.analyzed}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <OnMissingSelect
                        value={r.on_missing}
                        onChange={(v) => setField(key, { on_missing: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800 underline"
          onClick={() => props.onChange(defaultComprobanteValidationSettings())}
        >
          Restaurar valores por defecto de esta sección
        </button>
      </div>
    </div>
  );
}
