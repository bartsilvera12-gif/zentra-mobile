-- =============================================================================
-- chat_push_subscriptions
--
-- Almacena las suscripciones Web Push (VAPID) por usuario y empresa para
-- entregar notificaciones de mensajes nuevos cuando la PWA está cerrada o en
-- background.
--
-- El cliente PWA suscribe al usuario via /api/push/subscribe pasando el
-- PushSubscription serializado. Cuando llega un mensaje inbound al webhook de
-- WhatsApp/Meta, el backend recorre las suscripciones de la empresa y dispara
-- un Web Push a cada endpoint usando `web-push` con las VAPID env vars.
--
-- Una misma persona puede tener varias suscripciones (un teléfono Android +
-- una tablet, por ejemplo) — el unique constraint es por endpoint.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id    uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  CONSTRAINT chat_push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_chat_push_subscriptions_empresa
  ON public.chat_push_subscriptions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_chat_push_subscriptions_usuario
  ON public.chat_push_subscriptions(usuario_id);

ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: cada usuario ve y borra solo sus propias suscripciones (las inserciones
-- pasan por el endpoint con service-role; lectura/borrado seguro desde cliente).
DROP POLICY IF EXISTS chat_push_subscriptions_select_own ON public.chat_push_subscriptions;
CREATE POLICY chat_push_subscriptions_select_own
  ON public.chat_push_subscriptions FOR SELECT
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS chat_push_subscriptions_delete_own ON public.chat_push_subscriptions;
CREATE POLICY chat_push_subscriptions_delete_own
  ON public.chat_push_subscriptions FOR DELETE
  USING (usuario_id = auth.uid());
