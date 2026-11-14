import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DEFAULT_POOL_IDLE_TIMEOUT_MS, type PoolSizing } from "./config";
import { requireDatabaseUrl } from "./database-url";
import { announcePool, retirePool } from "./pool-observer";
import * as rateLimitSchema from "./schema/rate-limit";

const rlSchema = { ...rateLimitSchema };

export type RateLimitDbClient = ReturnType<typeof drizzle<typeof rlSchema>>;

export const DEFAULT_RATE_LIMIT_POOL_MAX = 3;

let _rateLimitDb: RateLimitDbClient | null = null;
let _rateLimitPool: Pool | null = null;
let sizing: PoolSizing = {
  max: DEFAULT_RATE_LIMIT_POOL_MAX,
  idleTimeoutMillis: DEFAULT_POOL_IDLE_TIMEOUT_MS,
};

export function configureRateLimitDbPool(next: PoolSizing): void {
  if (_rateLimitPool)
    throw new Error("the rate-limit pool is already open, size it before the first query");

  sizing = next;
}

export function getRateLimitDbClient(): RateLimitDbClient {
  if (_rateLimitDb) return _rateLimitDb;

  _rateLimitPool = announcePool(
    new Pool({
      connectionString: requireDatabaseUrl(),
      max: sizing.max,
      connectionTimeoutMillis: 500,
      idleTimeoutMillis: sizing.idleTimeoutMillis,
    }),
  );
  _rateLimitDb = drizzle(_rateLimitPool, { schema: rlSchema });

  return _rateLimitDb;
}

export async function closeRateLimitDb(): Promise<void> {
  const pool = _rateLimitPool;
  if (!pool) return;

  _rateLimitPool = null;
  _rateLimitDb = null;
  retirePool(pool);
  await pool.end();
}
