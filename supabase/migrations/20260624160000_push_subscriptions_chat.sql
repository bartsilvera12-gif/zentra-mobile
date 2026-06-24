-- =============================================================================
-- public.chat_push_subscriptions
--
-- Tabla global (compartida por todos los tenants) que almacena suscripciones
-- Web Push (VAPID) por usuario y empresa. Cuando el webhook de WhatsApp recibe
-- un mensaje inbound, el backend recorre las suscripciones de la empresa y
-- dispara un Web Push a cada endpoint usando `web-push` con las VAPID env vars.
--
-- Vive en `public` (no en cada schema-tenant ni en el catálogo central) porque:
--  - es un dato global por dispositivo, sin lógica de negocio,
--  - empresa_id/usuario_id se guardan como UUIDs sueltos — los FKs no se
--    pueden materializar (las tablas referenciadas viven en schemas dinámicos
--    por tenant, no en `public`),
--  - una sola tabla simplifica el helper de envío (no hay que iterar schemas).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  usuario_id    uuid,
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

-- RLS: las escrituras pasan por el endpoint con service-role (bypass), y al
-- no haber UI que liste suscripciones de otros usuarios, mantenemos RLS
-- activado con políticas mínimas (sin SELECT abierto al anon role).
ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;
