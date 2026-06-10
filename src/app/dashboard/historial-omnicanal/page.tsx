import { Suspense } from "react";
import { getCurrentUserDisplayNameServer } from "@/lib/auth/get-current-user-display-name-server";
import { getChatDataSchemaForCurrentUser } from "@/lib/chat/empresa-chat-schema-server";
import { getConversacionesInboxBootstrap } from "@/lib/chat/chat-ops-actions";
import { ConversacionesClient } from "../conversaciones/ConversacionesClient";
import DeviceRouter from "@/shared/device/DeviceRouter";
import HistorialOmnicanalMobile from "@/mobile/pages/HistorialOmnicanalMobile";

export default async function HistorialOmnicanalPage() {
  const [chatDataSchema, agentDisplayName, bootstrap] = await Promise.all([
    getChatDataSchemaForCurrentUser(),
    getCurrentUserDisplayNameServer(),
    getConversacionesInboxBootstrap().catch(() => null),
  ]);
  return (
    <DeviceRouter
      desktop={
        <Suspense fallback={<div className="p-6 text-slate-400 text-sm animate-pulse">Cargando historial…</div>}>
          <ConversacionesClient
            mode="historial"
            chatDataSchema={chatDataSchema}
            agentDisplayName={agentDisplayName}
            initialOmnicanalRole={bootstrap?.omnicanal_role ?? null}
          />
        </Suspense>
      }
      mobile={<HistorialOmnicanalMobile />}
    />
  );
}
