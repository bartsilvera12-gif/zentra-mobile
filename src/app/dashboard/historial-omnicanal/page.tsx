import { Suspense } from "react";
import { getCurrentUserDisplayNameServer } from "@/lib/auth/get-current-user-display-name-server";
import { getChatDataSchemaForCurrentUser } from "@/lib/chat/empresa-chat-schema-server";
import { ConversacionesClient } from "../conversaciones/ConversacionesClient";

export default async function HistorialOmnicanalPage() {
  const [chatDataSchema, agentDisplayName] = await Promise.all([
    getChatDataSchemaForCurrentUser(),
    getCurrentUserDisplayNameServer(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm animate-pulse">Cargando historial…</div>}>
      <ConversacionesClient
        mode="historial"
        chatDataSchema={chatDataSchema}
        agentDisplayName={agentDisplayName}
      />
    </Suspense>
  );
}
