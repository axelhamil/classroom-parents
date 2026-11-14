import "dotenv/config";
import { drizzle, type NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { Pool } from "pg";
import { requireDatabaseUrl } from "./database-url";
import { announcePool, retirePool } from "./pool-observer";
import * as authSchema from "./schema/auth";
import * as outboxSchema from "./schema/outbox";

// BetterAuth's Drizzle adapter resolves every model its plugins write from this
// object, so a table a plugin owns has to be listed here, not only exported from
// the package.
const schema = {
  ...authSchema,
  ...outboxSchema,
};

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export type Transaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export const DEFAULT_POOL_MAX = 20;

export const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;

export interface PoolSizing {
  max: number;
  idleTimeoutMillis: number;
}

let _db: DbClient | null = null;
let _pool: Pool | null = null;
let sizing: PoolSizing = { max: DEFAULT_POOL_MAX, idleTimeoutMillis: DEFAULT_POOL_IDLE_TIMEOUT_MS };

export function configureDbPool(next: PoolSizing): void {
  if (_pool) throw new Error("the database pool is already open, size it before the first query");

  sizing = next;
}

function getDb(): DbClient {
  if (_db) return _db;

  _pool = announcePool(
    new Pool({
      connectionString: requireDatabaseUrl(),
      max: sizing.max,
      idleTimeoutMillis: sizing.idleTimeoutMillis,
      connectionTimeoutMillis: 5000,
    }),
  );
  _db = drizzle(_pool, { schema });

  return _db;
}

export async function closeDb(): Promise<void> {
  const pool = _pool;
  if (!pool) return;

  _pool = null;
  _db = null;
  retirePool(pool);
  await pool.end();
}

export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
