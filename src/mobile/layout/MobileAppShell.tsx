"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "./BottomNav";
import MobileHeader from "./MobileHeader";

const STANDALONE_ROUTES = ["/login"];

/**
 * Shell mobile del ERP. Estructura:
 *
 *  ┌──────────────────────────────┐
 *  │  MobileHeader (sticky top)   │  ← logo + título de pantalla + acciones
 *  ├──────────────────────────────┤
 *  │                              │
 *  │      Contenido (main)        │  ← scroll vertical, padding-bottom 56px
 *  │                              │
 *  ├──────────────────────────────┤
 *  │  BottomNav (fixed bottom)    │  ← 5 ítems, safe-area-inset-bottom
 *  └──────────────────────────────┘
 *
 *  El botón "Más" del BottomNav abre el Sidebar existente como sheet desde la izquierda
 *  (reutilizamos su modo mobileOpen). Esto es transicional — el menú "Más" dedicado de
 *  mobile se construye más adelante.
 */
export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = pathname && STANDALONE_ROUTES.includes(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar el menú lateral al navegar.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
      {/* Backdrop del sheet del menú */}
      <button
        type="button"
        aria-label="Cerrar menú"
        aria-hidden={!menuOpen}
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-200 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

      <MobileHeader onOpenMenu={() => setMenuOpen(true)} />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-16">
        {children}
      </main>

      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
