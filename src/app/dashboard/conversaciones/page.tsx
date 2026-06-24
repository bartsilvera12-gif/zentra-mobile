/**
 * Inbox de conversaciones — única pantalla de la app.
 *
 * Renderiza el cliente rediseñado (`ConversacionesMobile`) en cualquier
 * dispositivo. Ya no hay branching desktop/mobile ni bootstrap pesado del
 * inbox legacy: el cliente trae sus propios datos vía hooks.
 */
import ConversacionesMobile from "@/mobile/pages/ConversacionesMobile";

export default function ConversacionesInboxPage() {
  return <ConversacionesMobile />;
}
