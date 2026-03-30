/** Configuración en `chat_channels.config.comprobante_validation` */

export type OcrFieldKey = "monto" | "referencia" | "fecha" | "hora" | "banco" | "texto_completo";

export type OnMissingBehavior = "continuar" | "revision_manual" | "bloquear";

export type ComprobanteEstadoValidacion =
  | "pendiente"
  | "valido"
  | "duplicado_hash"
  | "duplicado_ocr"
  | "revision_manual"
  | "ocr_error"
  | "monto_incoherente";

export interface OcrFieldRule {
  analyzed: boolean;
  use_duplicate_detection: boolean;
  required: boolean;
  on_missing: OnMissingBehavior;
}

export interface ComprobanteValidationMessages {
  hash_duplicado: string;
  ocr_duplicado: string;
  revision_manual: string;
  ocr_insuficiente: string;
  /** Monto del comprobante no coincide con el elegido en el flujo (validación opt-in). */
  monto_incoherente: string;
  boton_otro_titulo: string;
  boton_asesor_titulo: string;
}

export interface ComprobanteValidationSettings {
  /** Maestro: si false, no se aplica capa (flujo actual sin cambios). */
  enabled: boolean;
  /**
   * Si true, tras OCR compara monto detectado vs monto en chat_flow_data del flow_session_id activo.
   * Por defecto false: no altera el comportamiento existente.
   */
  validar_monto_vs_flujo: boolean;
  /** Tolerancia en guaraníes: abs(ocr - esperado) <= tolerancia se considera válido. */
  monto_tolerancia_absoluta_gs: number;
  /** Orden de lectura de field_name en chat_flow_data para el monto esperado. */
  monto_fields_prioridad: string[];
  deteccion_duplicados_hash: boolean;
  ocr_obligatorio: boolean;
  bloquear_por_hash_duplicado: boolean;
  bloquear_por_ocr_duplicado: boolean;
  revision_manual_si_sospecha_ocr: boolean;
  /** Si true, en revisión manual se marca conversación en modo humano (deja de responder el bot). */
  revision_manual_activar_takeover: boolean;
  /** Texto OCR más corto que esto → sospecha (si el toggle de sospecha está activo). */
  ocr_min_chars_sospecha: number;
  /** Cuando falla OCR o PDF sin OCR automático. */
  ocr_fallo_comportamiento: OnMissingBehavior;
  messages: ComprobanteValidationMessages;
  ocr_fields: Record<OcrFieldKey, OcrFieldRule>;
}

export const COMPROBANTE_BUTTON_IDS = {
  enviar_otro: "cmp_enviar_otro",
  hablar_asesor: "cmp_hablar_asesor",
} as const;

/** Claves en `chat_flow_data` (por flow_session_id). */
export const SORTEO_COMPROBANTE_VALIDACION_ID_FIELD = "sorteo_comprobante_validacion_id";
export const SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD = "sorteo_comprobante_estado_validacion";
export const SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD = "sorteo_comprobante_motivo_validacion";
export const SORTEO_COMPROBANTE_HASH_FIELD = "sorteo_comprobante_hash";
export const SORTEO_COMPROBANTE_OCR_TEXT_FIELD = "sorteo_comprobante_ocr_text_raw";
export const SORTEO_COMPROBANTE_OCR_MONTO_FIELD = "sorteo_comprobante_ocr_monto";
export const SORTEO_COMPROBANTE_OCR_REF_FIELD = "sorteo_comprobante_ocr_referencia";
export const SORTEO_COMPROBANTE_OCR_FECHA_FIELD = "sorteo_comprobante_ocr_fecha";
export const SORTEO_COMPROBANTE_OCR_HORA_FIELD = "sorteo_comprobante_ocr_hora";
export const SORTEO_COMPROBANTE_OCR_BANCO_FIELD = "sorteo_comprobante_ocr_banco";

export const DEFAULT_COMPROBANTE_VALIDATION_MESSAGES: ComprobanteValidationMessages = {
  hash_duplicado:
    "Este comprobante ya fue registrado en una compra anterior. Si es un error, enviá otro comprobante o hablá con un asesor.",
  ocr_duplicado:
    "Detectamos que los datos del comprobante coinciden con un pago ya registrado. Enviá otro comprobante o contactá a un asesor.",
  revision_manual:
    "Recibimos tu comprobante. Nuestro equipo lo está revisando; en breve te confirmamos. Podés seguir con los datos si el flujo te lo pide.",
  ocr_insuficiente:
    "No pudimos leer bien el comprobante. Enviá una foto más clara o hablá con un asesor.",
  monto_incoherente:
    "El comprobante recibido no coincide con el monto seleccionado. Podés reenviar el comprobante o hablar con un asesor.",
  boton_otro_titulo: "Otro comprobante",
  boton_asesor_titulo: "Hablar con asesor",
};

function defaultOcrFieldRule(partial: Partial<OcrFieldRule> = {}): OcrFieldRule {
  return {
    analyzed: partial.analyzed ?? true,
    use_duplicate_detection: partial.use_duplicate_detection ?? false,
    required: partial.required ?? false,
    on_missing: partial.on_missing ?? "continuar",
  };
}

export function defaultComprobanteValidationSettings(): ComprobanteValidationSettings {
  return {
    enabled: false,
    validar_monto_vs_flujo: false,
    monto_tolerancia_absoluta_gs: 0,
    monto_fields_prioridad: ["monto", "monto_compra", "sorteo_monto_opcion"],
    deteccion_duplicados_hash: true,
    ocr_obligatorio: true,
    bloquear_por_hash_duplicado: true,
    bloquear_por_ocr_duplicado: true,
    revision_manual_si_sospecha_ocr: true,
    revision_manual_activar_takeover: false,
    ocr_min_chars_sospecha: 24,
    ocr_fallo_comportamiento: "revision_manual",
    messages: { ...DEFAULT_COMPROBANTE_VALIDATION_MESSAGES },
    ocr_fields: {
      monto: defaultOcrFieldRule({ analyzed: true, required: false, on_missing: "continuar" }),
      referencia: defaultOcrFieldRule({
        analyzed: true,
        use_duplicate_detection: true,
        required: false,
        on_missing: "continuar",
      }),
      fecha: defaultOcrFieldRule({ analyzed: true, required: false, on_missing: "continuar" }),
      hora: defaultOcrFieldRule({ analyzed: true, required: false, on_missing: "continuar" }),
      banco: defaultOcrFieldRule({ analyzed: true, required: false, on_missing: "continuar" }),
      texto_completo: defaultOcrFieldRule({
        analyzed: true,
        use_duplicate_detection: false,
        required: false,
        on_missing: "continuar",
      }),
    },
  };
}

function isOnMissingBehavior(v: unknown): v is OnMissingBehavior {
  return v === "continuar" || v === "revision_manual" || v === "bloquear";
}

function mergeOcrFieldRule(raw: unknown, fallback: OcrFieldRule): OcrFieldRule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const o = raw as Record<string, unknown>;
  const onMissing = o.on_missing;
  return {
    analyzed: typeof o.analyzed === "boolean" ? o.analyzed : fallback.analyzed,
    use_duplicate_detection:
      typeof o.use_duplicate_detection === "boolean" ? o.use_duplicate_detection : fallback.use_duplicate_detection,
    required: typeof o.required === "boolean" ? o.required : fallback.required,
    on_missing: isOnMissingBehavior(onMissing) ? onMissing : fallback.on_missing,
  };
}

export function parseComprobanteValidationConfig(config: unknown): ComprobanteValidationSettings {
  const base = defaultComprobanteValidationSettings();
  if (!config || typeof config !== "object" || Array.isArray(config)) return base;
  const root = (config as Record<string, unknown>).comprobante_validation;
  if (!root || typeof root !== "object" || Array.isArray(root)) return base;
  const r = root as Record<string, unknown>;
  const messagesRaw = r.messages;
  const messages =
    messagesRaw && typeof messagesRaw === "object" && !Array.isArray(messagesRaw)
      ? (messagesRaw as Record<string, unknown>)
      : {};

  const mergedMessages: ComprobanteValidationMessages = {
    hash_duplicado:
      typeof messages.hash_duplicado === "string" && messages.hash_duplicado.trim()
        ? messages.hash_duplicado.trim()
        : base.messages.hash_duplicado,
    ocr_duplicado:
      typeof messages.ocr_duplicado === "string" && messages.ocr_duplicado.trim()
        ? messages.ocr_duplicado.trim()
        : base.messages.ocr_duplicado,
    revision_manual:
      typeof messages.revision_manual === "string" && messages.revision_manual.trim()
        ? messages.revision_manual.trim()
        : base.messages.revision_manual,
    ocr_insuficiente:
      typeof messages.ocr_insuficiente === "string" && messages.ocr_insuficiente.trim()
        ? messages.ocr_insuficiente.trim()
        : base.messages.ocr_insuficiente,
    boton_otro_titulo:
      typeof messages.boton_otro_titulo === "string" && messages.boton_otro_titulo.trim()
        ? messages.boton_otro_titulo.trim().slice(0, 20)
        : base.messages.boton_otro_titulo,
    boton_asesor_titulo:
      typeof messages.boton_asesor_titulo === "string" && messages.boton_asesor_titulo.trim()
        ? messages.boton_asesor_titulo.trim().slice(0, 20)
        : base.messages.boton_asesor_titulo,
    monto_incoherente:
      typeof messages.monto_incoherente === "string" && messages.monto_incoherente.trim()
        ? messages.monto_incoherente.trim()
        : base.messages.monto_incoherente,
  };

  const ocrFieldsRaw = r.ocr_fields;
  const ocrMerged = { ...base.ocr_fields };
  if (ocrFieldsRaw && typeof ocrFieldsRaw === "object" && !Array.isArray(ocrFieldsRaw)) {
    const of = ocrFieldsRaw as Record<string, unknown>;
    for (const k of Object.keys(ocrMerged) as OcrFieldKey[]) {
      if (of[k] !== undefined) {
        ocrMerged[k] = mergeOcrFieldRule(of[k], base.ocr_fields[k]);
      }
    }
  }

  const fallo = r.ocr_fallo_comportamiento;

  let montoFields: string[] = base.monto_fields_prioridad;
  const mfp = r.monto_fields_prioridad;
  if (Array.isArray(mfp)) {
    const cleaned = mfp
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0 && x.length <= 64)
      .slice(0, 20);
    if (cleaned.length > 0) montoFields = cleaned;
    else montoFields = [...base.monto_fields_prioridad];
  }

  const tolRaw = r.monto_tolerancia_absoluta_gs;
  const tolerancia =
    typeof tolRaw === "number" && Number.isFinite(tolRaw) && tolRaw >= 0
      ? Math.min(Math.trunc(tolRaw), 1_000_000_000)
      : base.monto_tolerancia_absoluta_gs;

  return {
    enabled: r.enabled === true,
    validar_monto_vs_flujo: r.validar_monto_vs_flujo === true,
    monto_tolerancia_absoluta_gs: tolerancia,
    monto_fields_prioridad: montoFields,
    deteccion_duplicados_hash: r.deteccion_duplicados_hash !== false,
    ocr_obligatorio: r.ocr_obligatorio !== false,
    bloquear_por_hash_duplicado: r.bloquear_por_hash_duplicado !== false,
    bloquear_por_ocr_duplicado: r.bloquear_por_ocr_duplicado !== false,
    revision_manual_si_sospecha_ocr: r.revision_manual_si_sospecha_ocr !== false,
    revision_manual_activar_takeover: r.revision_manual_activar_takeover === true,
    ocr_min_chars_sospecha:
      typeof r.ocr_min_chars_sospecha === "number" && r.ocr_min_chars_sospecha >= 0
        ? Math.min(500, Math.trunc(r.ocr_min_chars_sospecha))
        : base.ocr_min_chars_sospecha,
    ocr_fallo_comportamiento: isOnMissingBehavior(fallo) ? fallo : base.ocr_fallo_comportamiento,
    messages: mergedMessages,
    ocr_fields: ocrMerged,
  };
}

export function comprobanteValidationSettingsForForm(
  settings: ComprobanteValidationSettings
): Record<string, unknown> {
  return {
    enabled: settings.enabled,
    validar_monto_vs_flujo: settings.validar_monto_vs_flujo,
    monto_tolerancia_absoluta_gs: settings.monto_tolerancia_absoluta_gs,
    monto_fields_prioridad: [...settings.monto_fields_prioridad],
    deteccion_duplicados_hash: settings.deteccion_duplicados_hash,
    ocr_obligatorio: settings.ocr_obligatorio,
    bloquear_por_hash_duplicado: settings.bloquear_por_hash_duplicado,
    bloquear_por_ocr_duplicado: settings.bloquear_por_ocr_duplicado,
    revision_manual_si_sospecha_ocr: settings.revision_manual_si_sospecha_ocr,
    revision_manual_activar_takeover: settings.revision_manual_activar_takeover,
    ocr_min_chars_sospecha: settings.ocr_min_chars_sospecha,
    ocr_fallo_comportamiento: settings.ocr_fallo_comportamiento,
    messages: { ...settings.messages },
    ocr_fields: JSON.parse(JSON.stringify(settings.ocr_fields)),
  };
}
