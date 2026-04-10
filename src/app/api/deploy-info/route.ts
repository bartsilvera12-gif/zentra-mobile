import { NextResponse } from "next/server";

function hostnameFromNextPublicSupabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/**
 * GET /api/deploy-info
 * Identificador del build desplegado (Vercel inyecta VERCEL_GIT_COMMIT_SHA).
 * Sirve para comprobar que producción/preview tiene el mismo código que GitHub.
 */
export async function GET() {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    null;
  return NextResponse.json({
    git_commit_sha: sha,
    vercel_env: process.env.VERCEL_ENV ?? null,
    /** Hostname que usa el servidor en `resolveApiAuthContext` / `auth.getUser` (misma env que el cliente público). */
    supabase_api_hostname: hostnameFromNextPublicSupabaseUrl(),
    /** Presencia en JSON confirma deploy con auth/data-schema vía RLS (sin service key obligatoria en ese flujo). */
    neura_auth_bundle: "api-auth-context-v2-rls",
  });
}
