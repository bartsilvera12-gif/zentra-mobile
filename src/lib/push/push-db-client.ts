import "server-only";
import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Cliente Supabase service-role apuntando al schema `public`, donde vive la
 * tabla global `chat_push_subscriptions`. Se reusa entre `notify-chat`,
 * `subscribe`, `unsubscribe` y `diagnostic`.
 */
let cached: AppSupabaseClient | null = null;
export function getPushDbClient(): AppSupabaseClient {
  if (!cached) cached = createServiceRoleClientWithDbSchema("public");
  return cached;
}
