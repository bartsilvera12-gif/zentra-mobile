import { Suspense } from "react";
import { ColasInner } from "./ColasInner";

/** Evita prerender estático; la vista usa search params en el cliente. */
export const dynamic = "force-dynamic";

/**
 * Server Component que envuelve `ColasInner` en Suspense.
 *
 * `useSearchParams()` dentro del child cliente exige un boundary Suspense cuyo
 * padre sea Server Component — si esta página fuera "use client", Next 16 rompe
 * el prerender (csr-bailout) y el build falla. Misma pieza que `canales/page.tsx`.
 *
 * Bajo el shell solo-conversaciones esta ruta es inaccesible (el middleware
 * redirige a /dashboard/conversaciones), pero el build igual la genera.
 */
export default function ConfiguracionColasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
          Cargando colas…
        </div>
      }
    >
      <ColasInner />
    </Suspense>
  );
}
