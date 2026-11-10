import { sql } from "drizzle-orm";
import { resolveExecutor } from "./services/transaction-manager.service";

export async function lockForTransaction(key: string): Promise<void> {
  await resolveExecutor().execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function lockAllForTransaction(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const ordered = [...new Set(keys)].sort();
  await resolveExecutor().execute(
    sql`select pg_advisory_xact_lock(hashtextextended(lock.key, 0)) from unnest(${sql.param(ordered)}::text[]) with ordinality as lock(key, position) order by lock.position`,
  );
}

export async function tryLockForTransaction(key: string): Promise<boolean> {
  const result = await resolveExecutor().execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
  );
  return result.rows[0]?.locked === true;
}
