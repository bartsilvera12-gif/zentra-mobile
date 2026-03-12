import { createBrowserClient } from "@supabase/ssr";

// Placeholders para permitir build en Vercel sin env vars; en producción debe configurar las variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn("[Supabase] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no definidas. Configure las variables en Vercel.");
}

/** Cliente Supabase que persiste la sesión en cookies (necesario para que la API lea la sesión). */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);
