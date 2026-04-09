import { Suspense } from "react";
import { getChatDataSchemaForCurrentUser } from "@/lib/chat/empresa-chat-schema-server";
import { ConversacionesClient } from "./ConversacionesClient";

export default async function ConversacionesInboxPage() {
  const chatDataSchema = await getChatDataSchemaForCurrentUser();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm animate-pulse">Cargando conversaciones…</div>}>
      <ConversacionesClient mode="inbox" chatDataSchema={chatDataSchema} />
    </Suspense>
  );
}
