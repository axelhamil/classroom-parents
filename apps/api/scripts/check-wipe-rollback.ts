/**
 * Proves against a real Postgres that a failed deletion-confirmation enqueue rolls back
 * the whole account-wipe transaction, the guarantee added by moving `sendTemplate` inside
 * `this.transactions.run(...)` in `RgpdService.executeAccountWipe`.
 *
 * A mocked unit-of-work (see `rgpd.service.test.ts`) can only prove the callback *throws*
 * instead of returning; only a real `db.transaction(...)` can prove Postgres actually
 * discards the wipe's writes when that throw happens. This script is that proof.
 *
 * Note: `DrizzleEmailQueue.enqueue` uses `onConflictDoNothing` on the idempotency-key unique
 * index (see `fix(email): suppress duplicate enqueues instead of failing the batch`), so a
 * pre-existing row with the same idempotency key is silently skipped rather than raising a
 * SQL error, it can no longer be used to force the enqueue to fail. Instead this script adds
 * a temporary CHECK constraint on `email_message.to_address` that rejects the probe user's
 * email, forcing a genuine Postgres-level failure at the exact insert the wipe transaction
 * performs, then drops the constraint again in cleanup.
 *
 * A second probe then runs a wipe that succeeds and proves what the mocks cannot: the erased
 * account loses its sessions and sign-in accounts in the same transaction, its row is
 * anonymized, and `USER_DELETED` reaches the outbox.
 *
 * WARNING: `ALTER TABLE ... ADD CONSTRAINT` takes an ACCESS EXCLUSIVE lock on the shared
 * `email_message` table for the duration of the statement, stop the dev API worker (and any
 * other process reading/writing `email_message`) before running this script, or the lock wait
 * will queue behind it. This script also refuses to run against a non-local `DATABASE_URL` and
 * caps the lock wait with `lock_timeout` so a stuck lock fails fast instead of hanging.
 */

import { checkRecorder, exitUnlessLocalDatabase } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-wipe-rollback", process.env.DATABASE_URL);

import type { IInstrumentation } from "@packages/ddd-kit";
import { authSchema, db, eq, outboxSchema, sql, TransactionService } from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import { QueuedEmailService } from "@packages/email/email.service";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { RgpdService } from "../src/modules/rgpd/application/services/rgpd.service";
import { DrizzleRgpdRepository } from "../src/modules/rgpd/infrastructure/repositories/drizzle-rgpd.repository";
import { env } from "../src/shared/env";
import { logger } from "../src/shared/logger";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const instrumentation: IInstrumentation = new NoOpInstrumentation();
const PROBE_MARKER = "wipe-rollback-probe";
const userId = `check-wipe-rollback-${crypto.randomUUID()}`;
const probeEmail = `${PROBE_MARKER}-${userId}@example.com`;
const CONSTRAINT_NAME = "check_wipe_rollback_probe";

const erasedId = `check-wipe-erased-${crypto.randomUUID()}`;
const erasedEmail = `${erasedId}@example.com`;

const checks = checkRecorder();
const { check } = checks;

async function seedAccount(id: string, email: string): Promise<void> {
  await db.insert(authSchema.user).values({
    id,
    name: "Wipe Probe",
    email,
    emailVerified: true,
    pendingDeletionUntil: new Date(Date.now() - 1000),
    deletedAt: null,
  });
  await db.insert(authSchema.session).values({
    id: `${id}-session`,
    userId: id,
    token: `${id}-token`,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(authSchema.account).values({
    id: `${id}-account`,
    userId: id,
    accountId: id,
    providerId: "credential",
  });
}

async function sessionsOf(id: string): Promise<number> {
  const rows = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(eq(authSchema.session.userId, id));

  return rows.length;
}

async function addFailingConstraint(): Promise<void> {
  // Bound so a lock held by another process (e.g. a forgotten dev API worker) fails fast
  // instead of hanging the script indefinitely while holding up the wait queue.
  await db.execute(sql`SET lock_timeout = '5s'`);
  // DDL does not accept bind parameters, so the marker (a fixed, script-owned literal,
  // never user input) is inlined via sql.raw rather than a parameterized value.
  await db.execute(sql`
    ALTER TABLE email_message
    ADD CONSTRAINT ${sql.identifier(CONSTRAINT_NAME)}
    CHECK (to_address NOT LIKE ${sql.raw(`'%${PROBE_MARKER}%'`)})
  `);
}

async function dropFailingConstraint(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE email_message DROP CONSTRAINT IF EXISTS ${sql.identifier(CONSTRAINT_NAME)}
  `);
}

async function cleanup(): Promise<void> {
  await dropFailingConstraint();
  for (const [id, email] of [
    [userId, probeEmail],
    [erasedId, erasedEmail],
  ] as const) {
    await db.delete(authSchema.user).where(eq(authSchema.user.id, id));
    await db.execute(sql`DELETE FROM email_message WHERE to_address = ${email}`);
    await db.delete(outboxSchema.outboxEvent).where(eq(outboxSchema.outboxEvent.aggregateId, id));
  }
}

function buildService(): RgpdService {
  const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
  const email = new QueuedEmailService(
    new DrizzleEmailQueue(instrumentation, logger),
    instrumentation,
  );
  return new RgpdService(
    new DrizzleRgpdRepository(logger, instrumentation),
    email,
    new TransactionService(instrumentation),
    outbox,
    instrumentation,
    {
      appUrl: env.APP_URL,
      gracePeriodDays: env.RGPD_GRACE_PERIOD_DAYS,
      sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
    },
    logger,
  );
}

async function checkCompletedWipeErasesAccess(): Promise<void> {
  await seedAccount(erasedId, erasedEmail);

  const result = await buildService().executeAccountWipe({ userId: erasedId });
  check("the completed wipe reports success", result.isSuccess);

  const [row] = await db
    .select({ email: authSchema.user.email, deletedAt: authSchema.user.deletedAt })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, erasedId))
    .limit(1);
  check("the erased row is anonymized", row?.email !== erasedEmail && row?.deletedAt !== null, row);
  check("the erased account has no session left", (await sessionsOf(erasedId)) === 0);

  const accounts = await db
    .select({ id: authSchema.account.id })
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, erasedId));
  check("the erased account has no sign-in account left", accounts.length === 0, accounts);

  const announced = await db
    .select({ eventType: outboxSchema.outboxEvent.eventType })
    .from(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, erasedId));
  check(
    "the outbox announces the deletion once",
    JSON.stringify(announced.map((r) => r.eventType)) === JSON.stringify([EventTypes.USER_DELETED]),
    announced,
  );
}

async function main(): Promise<void> {
  await cleanup();
  await seedAccount(userId, probeEmail);
  await addFailingConstraint();

  const result = await buildService().executeAccountWipe({ userId });

  console.log("[1] executeAccountWipe result ->", result.isFailure ? result.getError() : "success");
  check("the wipe reports failure when the confirmation enqueue fails", result.isFailure);
  check(
    "the failure code is ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
    result.isFailure && result.getError().code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
  );

  const [row] = await db
    .select({
      email: authSchema.user.email,
      deletedAt: authSchema.user.deletedAt,
      pendingDeletionUntil: authSchema.user.pendingDeletionUntil,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);

  console.log("[2] user row after failed wipe ->", row);
  check("the user row still exists", row !== undefined);
  check("deleted_at is still NULL, the wipe did not persist", row?.deletedAt === null);
  check("the email was not anonymized, the wipe did not persist", row?.email === probeEmail);
  check("the session comes back with the rolled back wipe", (await sessionsOf(userId)) === 1);

  const readyForWipe = await new DrizzleRgpdRepository(
    logger,
    instrumentation,
  ).findUsersReadyForWipe(50);
  const stillPending =
    readyForWipe.isSuccess && readyForWipe.getValue().some((r) => r.userId === userId);
  console.log("[3] still returned by findUsersReadyForWipe ->", stillPending);
  check("the account is still picked up by the next sweep (not lost)", stillPending);

  await dropFailingConstraint();

  console.log("[4] a completed wipe erases the account's access");
  await checkCompletedWipeErasesAccess();

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log(
    "\nAll assertions passed: the failed wipe rolled back, the completed one erased access.",
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-wipe-rollback crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
