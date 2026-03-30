"use server";

import {
  SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
  SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
} from "@/lib/chat/comprobante-validation-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ConversacionesVista = "inbox" | "bot" | "historial";

export type InboxConversation = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  flow_status: string;
  human_taken_over: boolean;
  contact: {
    id: string;
    name: string | null;
    phone_number: string;
    cliente_id: string | null;
    crm_prospecto_id: string | null;
  };
};

/** Sesión Supabase + empresa del usuario (cookies de la petición). Obligatorio en Server Actions. */
async function requireSupabaseAndEmpresaId(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  empresa_id: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    throw new Error("Usuario no autenticado o sin empresa");
  }
  const { data, error } = await supabase
    .from("usuarios")
    .select("empresa_id")
    .eq("email", user.email)
    .single();
  if (error) {
    throw new Error(error.message);
  }
  const empresa_id = data?.empresa_id;
  if (!empresa_id || typeof empresa_id !== "string") {
    throw new Error("Usuario no autenticado o sin empresa");
  }
  return { supabase, empresa_id };
}

export async function fetchChatConversations(
  vista: ConversacionesVista = "inbox"
): Promise<InboxConversation[]> {
  const { supabase } = await requireSupabaseAndEmpresaId();
  let q = supabase.from("chat_conversations").select(
    `
      id,
      status,
      last_message_at,
      last_message_preview,
      unread_count,
      contact_id,
      flow_status,
      human_taken_over
    `
  );
  if (vista === "inbox") {
    q = q.or("human_taken_over.eq.true,flow_status.eq.human");
  } else if (vista === "bot") {
    q = q.eq("flow_status", "bot").eq("human_taken_over", false);
  }

  const { data: convs, error } = await q.order("last_message_at", {
    ascending: false,
    nullsFirst: false,
  });

  if (error) throw new Error(error.message);
  const list = convs ?? [];
  if (list.length === 0) return [];

  const contactIds = [...new Set(list.map((c) => c.contact_id as string))];
  const { data: contacts, error: e2 } = await supabase
    .from("chat_contacts")
    .select("id, name, phone_number, cliente_id, crm_prospecto_id")
    .in("id", contactIds);

  if (e2) throw new Error(e2.message);
  const byId = Object.fromEntries((contacts ?? []).map((c) => [c.id, c]));

  return list.map((row) => {
    const c = byId[row.contact_id as string];
    return {
      id: row.id as string,
      status: row.status as string,
      last_message_at: row.last_message_at as string | null,
      last_message_preview: row.last_message_preview as string | null,
      unread_count: (row.unread_count as number) ?? 0,
      flow_status: String(row.flow_status ?? "bot"),
      human_taken_over: Boolean(row.human_taken_over),
      contact: {
        id: c?.id ?? (row.contact_id as string),
        name: c?.name ?? null,
        phone_number: c?.phone_number ?? "",
        cliente_id: c?.cliente_id ?? null,
        crm_prospecto_id: c?.crm_prospecto_id ?? null,
      },
    };
  });
}

/**
 * Vuelve a modo bot (solo operador). No reinicia el flujo ni la sesión.
 */
export async function releaseConversationToBot(conversationId: string): Promise<void> {
  const { supabase, empresa_id } = await requireSupabaseAndEmpresaId();
  const id = conversationId.trim();
  if (!id) throw new Error("ID inválido");

  const { error } = await supabase
    .from("chat_conversations")
    .update({
      human_taken_over: false,
      flow_status: "bot",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", empresa_id);

  if (error) throw new Error(error.message);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { supabase } = await requireSupabaseAndEmpresaId();
  const { error } = await supabase
    .from("chat_conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw new Error(error.message);
}

export type ChatChannelRow = {
  id: string;
  empresa_id: string;
  type: string;
  meta_phone_number_id: string;
  nombre: string | null;
  provider: string;
  provider_channel_id: string | null;
  activo: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
};

export async function fetchChatChannels(): Promise<ChatChannelRow[]> {
  const { supabase } = await requireSupabaseAndEmpresaId();
  const { data, error } = await supabase
    .from("chat_channels")
    .select(
      "id, empresa_id, type, meta_phone_number_id, nombre, provider, provider_channel_id, activo, config, created_at, updated_at"
    )
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    type: (r.type as string) ?? "whatsapp",
    meta_phone_number_id: (r.meta_phone_number_id as string) ?? "",
    nombre: (r.nombre as string) ?? null,
    provider: (r.provider as string) ?? "meta",
    provider_channel_id: (r.provider_channel_id as string) ?? null,
    activo: r.activo !== false,
    config: (typeof r.config === "object" && r.config !== null ? r.config : {}) as Record<string, unknown>,
    created_at: (r.created_at as string) ?? "",
    updated_at: r.updated_at as string | undefined,
  }));
}

export type ChatChannelFormInput = {
  id?: string;
  nombre: string;
  meta_phone_number_id: string;
  provider_channel_id: string;
  activo: boolean;
  display_phone_number?: string;
  /** Token Meta para enviar desde el ERP; en edición, vacío = no cambiar el guardado */
  whatsapp_access_token?: string;
  /** Se guarda en `config.comprobante_validation` (validación de comprobantes WhatsApp). */
  comprobante_validation?: Record<string, unknown>;
};

export async function saveChatChannel(input: ChatChannelFormInput): Promise<void> {
  const { supabase, empresa_id } = await requireSupabaseAndEmpresaId();
  const pid = input.meta_phone_number_id.trim();
  if (!pid) throw new Error("Phone Number ID es obligatorio");

  const existingId =
    typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : undefined;

  const disp = input.display_phone_number?.trim();

  let config: Record<string, unknown> = { phone_number_id: pid };
  if (existingId) {
    const { data: prevRow } = await supabase
      .from("chat_channels")
      .select("config")
      .eq("id", existingId)
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    const prev =
      prevRow?.config &&
      typeof prevRow.config === "object" &&
      prevRow.config !== null &&
      !Array.isArray(prevRow.config)
        ? ({ ...(prevRow.config as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    config = { ...prev, phone_number_id: pid };
    if (disp) config.display_phone_number = disp;
  } else if (disp) {
    config.display_phone_number = disp;
  }

  if (input.comprobante_validation !== undefined) {
    config.comprobante_validation = input.comprobante_validation;
  }

  const base = {
    nombre: input.nombre.trim() || "WhatsApp",
    type: "whatsapp" as const,
    meta_phone_number_id: pid,
    provider: "meta",
    provider_channel_id: input.provider_channel_id.trim() || pid,
    activo: input.activo,
    config,
  };

  const tokenPatch = input.whatsapp_access_token?.trim();

  if (existingId) {
    const updatePayload: Record<string, unknown> = {
      ...base,
      updated_at: new Date().toISOString(),
    };
    if (tokenPatch) {
      updatePayload.whatsapp_access_token = tokenPatch;
    }
    const { data: updated, error } = await supabase
      .from("chat_channels")
      .update(updatePayload)
      .eq("id", existingId)
      .eq("empresa_id", empresa_id)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      throw new Error("No se pudo actualizar el canal (¿pertenece a tu empresa?).");
    }
    return;
  }

  const { error } = await supabase.from("chat_channels").insert({
    empresa_id,
    ...base,
    whatsapp_access_token: tokenPatch || null,
  });

  if (error) throw new Error(error.message);
}

export type ComprobanteValidacionListRow = {
  id: string;
  estado_validacion: string;
  motivo_validacion: string | null;
  comprobante_url: string | null;
  flow_code: string;
  created_at: string;
  ocr_referencia: string | null;
  ocr_monto: string | null;
  monto_validacion_esperado_gs: number | null;
  monto_validacion_ocr_gs: number | null;
  monto_validacion_diferencia_gs: number | null;
  monto_validacion_status: string | null;
};

export async function fetchComprobanteValidacionesForConversation(
  conversationId: string
): Promise<ComprobanteValidacionListRow[]> {
  const { supabase } = await requireSupabaseAndEmpresaId();
  const { data, error } = await supabase
    .from("chat_comprobante_validaciones")
    .select(
      "id, estado_validacion, motivo_validacion, comprobante_url, flow_code, created_at, ocr_referencia, ocr_monto, monto_validacion_esperado_gs, monto_validacion_ocr_gs, monto_validacion_diferencia_gs, monto_validacion_status"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ComprobanteValidacionListRow[];
}

export async function approveComprobanteValidacion(validacionId: string): Promise<void> {
  const { supabase, empresa_id } = await requireSupabaseAndEmpresaId();
  const id = validacionId.trim();
  if (!id) throw new Error("ID de validación inválido");

  const { data: row, error: qErr } = await supabase
    .from("chat_comprobante_validaciones")
    .select("id, conversation_id, flow_code, flow_session_id")
    .eq("id", id)
    .eq("empresa_id", empresa_id)
    .maybeSingle();

  if (qErr) throw new Error(qErr.message);
  if (!row) throw new Error("Validación no encontrada");

  const r = row as {
    id: string;
    conversation_id: string;
    flow_code: string;
    flow_session_id: string;
  };

  const now = new Date().toISOString();
  const { error: uErr } = await supabase
    .from("chat_comprobante_validaciones")
    .update({
      estado_validacion: "valido",
      motivo_validacion: "aprobado_manual_erp",
      updated_at: now,
    })
    .eq("id", id)
    .eq("empresa_id", empresa_id);

  if (uErr) throw new Error(uErr.message);

  const upserts = [
    {
      empresa_id,
      conversation_id: r.conversation_id,
      flow_code: r.flow_code.trim(),
      flow_session_id: r.flow_session_id,
      field_name: SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
      field_value: "valido",
    },
    {
      empresa_id,
      conversation_id: r.conversation_id,
      flow_code: r.flow_code.trim(),
      flow_session_id: r.flow_session_id,
      field_name: SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
      field_value: "aprobado_manual_erp",
    },
  ];

  const { error: dErr } = await supabase.from("chat_flow_data").upsert(upserts, {
    onConflict: "flow_session_id,field_name",
  });
  if (dErr) throw new Error(dErr.message);
}

export async function deleteChatChannel(id: string): Promise<void> {
  const { supabase, empresa_id } = await requireSupabaseAndEmpresaId();
  const { error } = await supabase.from("chat_channels").delete().eq("id", id).eq("empresa_id", empresa_id);
  if (error) throw new Error(error.message);
}
