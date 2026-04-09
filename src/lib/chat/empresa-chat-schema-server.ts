import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

/** Esquema PostgREST donde viven las tablas chat_* para el usuario actual (Server Components). */
export async function getChatDataSchemaForCurrentUser(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return SUPABASE_APP_SCHEMA;
  }

  const { data: urow } = await supabase
    .from("usuarios")
    .select("empresa_id")
    .eq("email", user.email)
    .maybeSingle();

  const empresaId = (urow as { empresa_id?: string } | null)?.empresa_id;
  if (!empresaId) {
    return SUPABASE_APP_SCHEMA;
  }

  const { data: emp } = await supabase
    .from("empresas")
    .select("data_schema")
    .eq("id", empresaId)
    .maybeSingle();

  const ds = (emp as { data_schema?: string | null } | null)?.data_schema?.trim();
  if (ds && ds.length > 0) return ds;
  return SUPABASE_APP_SCHEMA;
}
