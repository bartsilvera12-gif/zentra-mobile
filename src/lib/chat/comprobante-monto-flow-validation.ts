import type { SupabaseClient } from "@supabase/supabase-js";

/** Orden por defecto alineado con augmentSorteoPricing / flujo sorteos. */
export const DEFAULT_MONTO_FIELDS_PRIORIDAD = ["monto", "monto_compra", "sorteo_monto_opcion"] as const;

export type MontoValidacionAuditStatus =
  | "omitido_config"
  | "omitido_sin_esperado"
  | "omitido_sin_ocr"
  | "coincide"
  | "discrepancia";

export type MontoValidacionAudit = {
  monto_validacion_esperado_gs: number | null;
  monto_validacion_ocr_gs: number | null;
  monto_validacion_diferencia_gs: number | null;
  monto_validacion_status: MontoValidacionAuditStatus | null;
};

/** Igual criterio que extractReceiptFieldsFromOcr: dígitos del monto detectado. */
export function parseMontoOcrDigitsToGs(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function parseExpectedFlowValueToGs(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Lee chat_flow_data solo para el flow_session_id dado; primer campo con valor numérico válido según prioridad.
 */
export async function fetchExpectedMontoGsFromFlowSession(
  supabase: SupabaseClient,
  flowSessionId: string,
  fieldNames: string[]
): Promise<number | null> {
  const sid = flowSessionId.trim();
  if (!sid || fieldNames.length === 0) return null;

  const names = [...new Set(fieldNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return null;

  const { data, error } = await supabase
    .from("chat_flow_data")
    .select("field_name, field_value")
    .eq("flow_session_id", sid)
    .in("field_name", names);

  if (error || !data?.length) return null;

  const byLower = new Map<string, string>();
  for (const row of data as { field_name?: string; field_value?: string }[]) {
    const fn = (row.field_name ?? "").trim();
    if (!fn) continue;
    byLower.set(fn.toLowerCase(), row.field_value ?? "");
  }

  for (const name of names) {
    const v = byLower.get(name.toLowerCase());
    const parsed = parseExpectedFlowValueToGs(v);
    if (parsed != null) return parsed;
  }

  return null;
}

export type ValidateReceiptAmountAgainstFlowResult =
  | { apply: false; audit: MontoValidacionAudit }
  | { apply: true; ok: true; audit: MontoValidacionAudit }
  | { apply: true; ok: false; audit: MontoValidacionAudit };

/**
 * Capa opt-in: solo evalúa discrepancia cuando flag activo y existen ambos montos.
 * Si no aplica, devuelve apply:false y audit con status omitido_*.
 */
export async function validateReceiptAmountAgainstFlow(
  supabase: SupabaseClient,
  input: {
    flowSessionId: string;
    validar_monto_vs_flujo: boolean;
    monto_tolerancia_absoluta_gs: number;
    monto_fields_prioridad: string[];
    extractedMontoString: string;
  }
): Promise<ValidateReceiptAmountAgainstFlowResult> {
  const emptyAudit = (): MontoValidacionAudit => ({
    monto_validacion_esperado_gs: null,
    monto_validacion_ocr_gs: null,
    monto_validacion_diferencia_gs: null,
    monto_validacion_status: null,
  });

  if (!input.validar_monto_vs_flujo) {
    return {
      apply: false,
      audit: {
        ...emptyAudit(),
        monto_validacion_status: "omitido_config",
      },
    };
  }

  const ocrGs = parseMontoOcrDigitsToGs(input.extractedMontoString);
  if (ocrGs == null) {
    return {
      apply: false,
      audit: {
        monto_validacion_esperado_gs: null,
        monto_validacion_ocr_gs: null,
        monto_validacion_diferencia_gs: null,
        monto_validacion_status: "omitido_sin_ocr",
      },
    };
  }

  const fieldOrder =
    input.monto_fields_prioridad.length > 0
      ? input.monto_fields_prioridad
      : [...DEFAULT_MONTO_FIELDS_PRIORIDAD];

  const esperadoGs = await fetchExpectedMontoGsFromFlowSession(supabase, input.flowSessionId, fieldOrder);

  if (esperadoGs == null) {
    return {
      apply: false,
      audit: {
        monto_validacion_esperado_gs: null,
        monto_validacion_ocr_gs: ocrGs,
        monto_validacion_diferencia_gs: null,
        monto_validacion_status: "omitido_sin_esperado",
      },
    };
  }

  const tol = Math.max(0, Math.round(Number(input.monto_tolerancia_absoluta_gs) || 0));
  const diff = Math.abs(esperadoGs - ocrGs);
  const ok = diff <= tol;

  return {
    apply: true,
    ok,
    audit: {
      monto_validacion_esperado_gs: esperadoGs,
      monto_validacion_ocr_gs: ocrGs,
      monto_validacion_diferencia_gs: diff,
      monto_validacion_status: ok ? "coincide" : "discrepancia",
    },
  };
}
