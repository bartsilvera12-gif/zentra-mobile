"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";
import AssistantWidget from "./assistant/AssistantWidget";

const STANDALONE_ROUTES = ["/login"];

/** Asistente de ayuda (Fase 1): apagado por defecto; se habilita por env en el deploy. */
const ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "1";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = pathname && STANDALONE_ROUTES.includes(pathname);

  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div id="neura-app-shell" className="flex h-svh min-h-0 overflow-hidden bg-[#F8FAFC]">
      <Sidebar />
      <div id="neura-main-column" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main id="neura-main-content" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-6">
          {children}
        </main>
      </div>
      {ASSISTANT_ENABLED && <AssistantWidget />}
    </div>
  );
}
