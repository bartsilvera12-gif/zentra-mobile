"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";

const STANDALONE_ROUTES = ["/login"];

/** Asistente de ayuda (Fase 1): apagado temporalmente por performance.
 *  Para reactivarlo: poner ASSISTANT_KILL_SWITCH = false (y NEXT_PUBLIC_ASSISTANT_ENABLED=1 en Vercel). */
const ASSISTANT_KILL_SWITCH = true;
const ASSISTANT_ENABLED =
  !ASSISTANT_KILL_SWITCH && process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "1";

/** Carga diferida del widget: react-markdown + lógica del chat NO entran en el bundle principal,
 *  se descargan en un chunk aparte después de que la pantalla actual ya esté interactiva. */
const AssistantWidget = dynamic(() => import("./assistant/AssistantWidget"), { ssr: false });

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
