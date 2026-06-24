"use client";

/**
 * Shell mobile.
 *
 * La app mobile está acotada al módulo de Conversaciones. El módulo provee su
 * propio chrome (header de chat, lista, etc.), así que el shell se reduce a un
 * contenedor full-height que no inyecta header/bottom-nav/menú del ERP.
 *
 * Mantiene el manejo de altura segura (svh + safe-area) y un fondo neutro
 * para que el módulo monte sin parpadeos.
 */
export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#ECE5DD]">
      {children}
    </div>
  );
}
