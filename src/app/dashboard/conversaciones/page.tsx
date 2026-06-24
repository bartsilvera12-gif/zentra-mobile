import { Suspense } from "react";
import ConversacionesMobile from "@/mobile/pages/ConversacionesMobile";

/**
 * Inbox de conversaciones — única pantalla de la app.
 *
 * Server Component que envuelve el cliente rediseñado en Suspense. El cliente
 * usa `useSearchParams()` (para el `?id=X` que conmuta entre lista y chat) y
 * Next 16 exige que su padre prerenderable sea un Server Component con un
 * boundary Suspense; sin esto el build falla con "missing-suspense-with-csr-
 * bailout".
 */
export const dynamic = "force-dynamic";

export default function ConversacionesInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Cargando conversaciones…
        </div>
      }
    >
      <ConversacionesMobile />
    </Suspense>
  );
}
