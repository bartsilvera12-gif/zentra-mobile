import { Suspense } from "react";
import { loadFinalizedFilterOptions } from "@/lib/chat/finalized-closures-actions";
import FinalizedClosuresClient from "./FinalizedClosuresClient";
import DeviceRouter from "@/shared/device/DeviceRouter";
import ConversacionesFinalizadasMobile from "@/mobile/pages/ConversacionesFinalizadasMobile";

export default async function ConversacionesFinalizadasPage() {
  const filterOptions = await loadFinalizedFilterOptions();
  return (
    <DeviceRouter
      desktop={
        <Suspense fallback={<div className="p-8 text-slate-400 text-sm animate-pulse">Cargando finalizadas…</div>}>
          <FinalizedClosuresClient filterOptions={filterOptions} />
        </Suspense>
      }
      mobile={<ConversacionesFinalizadasMobile />}
    />
  );
}
