import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

/**
 * Mantiene `zentra_erp.omnichannel_routes` alineado con canales WhatsApp en esquema tenant.
 * En zentra_erp (sin tenant) elimina la ruta si existía, para que el webhook use `chat_channels` en catálogo.
 */
export async function syncOmnichannelRouteForWhatsappChannel(opts: {
  metaPhoneNumberId: string;
  empresaId: string;
  channelId: string;
  activo: boolean;
  dataSchema: string;
}): Promise<void> {
  const pid = opts.metaPhoneNumberId.trim();
  if (!pid) return;

  const catalog = createServiceRoleClient();

  if (opts.dataSchema === SUPABASE_APP_SCHEMA) {
    await catalog.from("omnichannel_routes").delete().eq("meta_phone_number_id", pid);
    return;
  }

  if (!opts.activo) {
    await catalog.from("omnichannel_routes").delete().eq("meta_phone_number_id", pid);
    return;
  }

  const { error } = await catalog.from("omnichannel_routes").upsert(
    {
      meta_phone_number_id: pid,
      empresa_id: opts.empresaId,
      channel_id: opts.channelId,
      data_schema: opts.dataSchema,
    },
    { onConflict: "meta_phone_number_id" }
  );

  if (error) {
    console.error("[omnichannel-route-sync] upsert:", error.message);
    throw new Error(error.message);
  }
}

export async function deleteOmnichannelRouteByMetaPhone(metaPhoneNumberId: string): Promise<void> {
  const pid = metaPhoneNumberId.trim();
  if (!pid) return;
  const catalog = createServiceRoleClient();
  await catalog.from("omnichannel_routes").delete().eq("meta_phone_number_id", pid);
}
