import { usuarioEmailLookupVariants } from "@/lib/auth/usuario-email-variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Nombre a mostrar en UI para el usuario autenticado (Server Components).
 * Orden: `usuarios.nombre` (auth_user_id o email) → metadata full_name → parte local del email.
 */
export async function getCurrentUserDisplayNameServer(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Usuario";

  const { data: byAuth } = await supabase
    .from("usuarios")
    .select("nombre")
    .eq("auth_user_id", user.id)
    .limit(1);
  const nAuth = (byAuth?.[0] as { nombre?: string | null } | undefined)?.nombre?.trim();
  if (nAuth) return nAuth;

  for (const em of usuarioEmailLookupVariants(user.email ?? "")) {
    const { data: rows } = await supabase.from("usuarios").select("nombre").ilike("email", em).limit(1);
    const nEmail = (rows?.[0] as { nombre?: string | null } | undefined)?.nombre?.trim();
    if (nEmail) return nEmail;
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;

  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "Usuario";
}
