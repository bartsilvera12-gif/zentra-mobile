"use client";

import { usePathname } from "next/navigation";

/**
 * Shell global de la app: la app es solo el módulo de Conversaciones.
 *
 * No hay sidebar, header de ERP, ni navegación a otros módulos. La página
 * renderiza pantalla completa (svh) tanto en desktop como en mobile. Solo
 * /login se renderiza standalone para no envolverlo en el contenedor del chat.
 */
const STANDALONE_ROUTES = ["/login"];

export default function ChatOnlyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = !!pathname && STANDALONE_ROUTES.includes(pathname);
  if (isStandalone) return <>{children}</>;
  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
      {children}
    </div>
  );
}
