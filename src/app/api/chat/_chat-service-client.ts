import { createServiceRoleClientForEmpresa } from "@/lib/supabase/empresa-data-schema";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/** Service role sobre el esquema de datos de chat de la empresa (zentra_erp o `data_schema`). */
export async function getChatServiceClientForEmpresa(empresaId: string): Promise<AppSupabaseClient> {
  return createServiceRoleClientForEmpresa(empresaId);
}
