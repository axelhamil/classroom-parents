export type { SQL } from "drizzle-orm";
export {
  and,
  arrayContains,
  asc,
  count,
  DrizzleQueryError,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  not,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
export { migrate } from "drizzle-orm/node-postgres/migrator";
export type { AnyPgColumn, AnyPgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
export { alias, QueryBuilder } from "drizzle-orm/pg-core";
export {
  lockAllForTransaction,
  lockForTransaction,
  tryLockForTransaction,
} from "./advisory-lock";
export {
  closeDb,
  configureDbPool,
  type DbClient,
  DEFAULT_POOL_MAX,
  db,
  type Transaction,
} from "./config";
export { dbOperationFailure } from "./db-failure";
export {
  claimedSet,
  dbClockNow,
  dbNow,
  deadShareOf,
  isDeadDue,
  isDue,
  leasedBy,
  releasedSet,
  secondsFromClock,
  secondsFromNow,
} from "./lease";
export { type DatabasePool, observeDatabasePools } from "./pool-observer";
export {
  closeRateLimitDb,
  configureRateLimitDbPool,
  DEFAULT_RATE_LIMIT_POOL_MAX,
  getRateLimitDbClient,
  type RateLimitDbClient,
} from "./rate-limit-client";

import * as authSchema from "./schema/auth";

export * as authSchema from "./schema/auth";
export const schema = { ...authSchema };
export * as emailSchema from "./schema/email";
export type { OutboxEventMetadata } from "./schema/outbox";
export * as outboxSchema from "./schema/outbox";
export * as rateLimitSchema from "./schema/rate-limit";
export * as sweepSchema from "./schema/sweep";
export {
  ambientTransaction,
  type FlushHandler,
  resolveExecutor,
  savepoint,
  TransactionService,
} from "./services/transaction-manager.service";
