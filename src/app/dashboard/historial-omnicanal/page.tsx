import { Suspense } from "react";
import { getChatDataSchemaForCurrentUser } from "@/lib/chat/empresa-chat-schema-server";
import { ConversacionesClient } from "../conversaciones/ConversacionesClient";

export default async function HistorialOmnicanalPage() {
  const chatDataSchema = await getChatDataSchemaForCurrentUser();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm animate-pulse">Cargando historial…</div>}>
      <ConversacionesClient mode="historial" chatDataSchema={chatDataSchema} />
    </Suspense>
  );
}
