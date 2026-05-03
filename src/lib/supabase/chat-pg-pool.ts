import pg from "pg";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/** Una sola instancia por runtime Node (Vercel isolate); sobrevive hot-reload vía globalThis. */
const GLOBAL_KEY = "__neura_CHAT_PG_POOL_SINGLETON__" as const;

function readGlobalPool(): pg.Pool | undefined {
  const g = globalThis as unknown as Record<string, pg.Pool | undefined>;
  return g[GLOBAL_KEY];
}

function writeGlobalPool(pool: pg.Pool | undefined): void {
  const g = globalThis as unknown as Record<string, pg.Pool | undefined>;
  g[GLOBAL_KEY] = pool;
}

/** Max conexiones por proceso Node hacia el pooler (Supabase session pool suele ser ~15 total). */
export function getPgPoolConfigMax(): number {
  const raw = process.env.PG_POOL_MAX?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) return n;
  }
  return 3;
}

export function isPgPoolExhaustionMessage(message: string): boolean {
  return (
    /EMAXCONNSESSION/i.test(message) ||
    /max clients reached/i.test(message) ||
    /too many connections/i.test(message)
  );
}

/** Stats seguros (sin secretos). Llamar ante EMAXCONNSESSION o diagnóstico. */
export function logPgPoolStats(
  tag: string,
  pool: pg.Pool | null,
  extra?: Record<string, unknown>
): void {
  if (!pool) return;
  const opts = (pool as unknown as { options?: { max?: number } }).options;
  console.warn("[pg-pool][stats]", {
    tag,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    max: opts?.max,
    ...extra,
  });
}

export function getChatPostgresConnectionString(): string | null {
  const u =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (u && u.length > 0) return u;
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const m = base?.match(/https:\/\/([^.]+)\.supabase\.co/i);
  if (!password || !m?.[1]) return null;
  const ref = m[1];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

/**
 * Pool Postgres directo (pooler). Una instancia global por runtime — no instanciar Pool por request.
 * Preferir en Vercel: URL del transaction pooler (puerto 6543, modo transaction) si preparación de sesión lo permite.
 */
export function getChatPostgresPool(): pg.Pool | null {
  const url = getChatPostgresConnectionString();
  if (!url) return null;

  let pool = readGlobalPool();
  if (!pool) {
    const max = getPgPoolConfigMax();
    pool = new pg.Pool({
      connectionString: url,
      max,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 12_000,
      allowExitOnIdle: true,
      ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (err) => {
      console.error("[pg-pool][idle-client-error]", err instanceof Error ? err.message : String(err));
    });
    writeGlobalPool(pool);
  }
  return pool;
}

export function quoteSchemaTable(schema: string, table: string): string {
  const s = assertAllowedChatDataSchema(schema);
  const t = table.replace(/[^\w]/g, "");
  if (!t) throw new Error("tabla inválida");
  return `"${s.replace(/"/g, '""')}"."${t.replace(/"/g, '""')}"`;
}
