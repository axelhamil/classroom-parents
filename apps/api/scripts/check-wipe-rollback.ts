/**
 * Proves against a real Postgres what the mocked unit of work in `rgpd.service.test.ts` cannot:
 *
 * 1. A wipe whose deletion-confirmation enqueue fails rolls back as a whole: the user row, its
 *    session and its outbox rows (email included) are all still there, `USER_DELETED` is not
 *    enqueued, and the next sweep still picks the account up. The failure is forced by a
 *    temporary CHECK constraint on `email_message.to_address`, dropped again in cleanup.
 * 2. A completed wipe revokes the child tokens while the user still exists, deletes the user row
 *    (sessions and accounts follow by FK cascade), purges every outbox row whose payload names
 *    the user as `userId` or `actorUserId`, keeps other users' rows, and leaves exactly one
 *    `USER_DELETED` without any email.
 * 3. A pending deletion inside its grace period is not returned by the sweep query.
 * 4. A parent signed in with Google only (no password) can request the deletion from a fresh
 *    session; a stale session or another user's session is refused with ACCOUNT_REAUTH_REQUIRED.
 *
 * WARNING: `ALTER TABLE ... ADD CONSTRAINT` takes an ACCESS EXCLUSIVE lock on `email_message`,
 * stop the dev API worker before running this script. It refuses any non-local `DATABASE_URL`
 * and caps the lock wait with `lock_timeout`.
 */

import { checkRecorder, exitUnlessLocalDatabase } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-wipe-rollback", process.env.DATABASE_URL);

import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  authSchema,
  db,
  eq,
  inArray,
  or,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import { QueuedEmailService } from "@packages/email/email.service";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IChildConnections } from "../src/modules/rgpd/application/ports/child-connections.port";
import { RgpdService } from "../src/modules/rgpd/application/services/rgpd.service";
import { DrizzleRgpdRepository } from "../src/modules/rgpd/infrastructure/repositories/drizzle-rgpd.repository";
import { env } from "../src/shared/env";
import { logger } from "../src/shared/logger";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const instrumentation: IInstrumentation = new NoOpInstrumentation();
const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const repository = new DrizzleRgpdRepository(logger, instrumentation);
const HOUR = 3_600_000;
const PROBE_MARKER = "wipe-rollback-probe";
const CONSTRAINT_NAME = "check_wipe_rollback_probe";

const probe = (label: string) => `check-wipe-${label}-${crypto.randomUUID()}`;
const rolledBackId = probe("rolled-back");
const erasedId = probe("erased");
const graceId = probe("grace");
const googleOnlyId = probe("google-only");
const staleId = probe("stale");
const bystanderId = probe("bystander");
const probeIds = [rolledBackId, erasedId, graceId, googleOnlyId, staleId, bystanderId];
const emailOf = (id: string) =>
  id === rolledBackId ? `${PROBE_MARKER}-${id}@example.com` : `${id}@example.com`;

const checks = checkRecorder();
const { check } = checks;

const revokedWhileUserExisted: boolean[] = [];
const childConnections: IChildConnections = {
  revokeAll: async (userId) => {
    revokedWhileUserExisted.push((await userRow(userId)) !== undefined);
    return Result.ok({ revoked: 2, failed: 0 });
  },
};

interface SeedOptions {
  pendingDeletionUntil: Date | null;
  sessionAgeMs: number;
}

async function seedUser(id: string, options: SeedOptions): Promise<void> {
  await db.insert(authSchema.user).values({
    id,
    name: "Wipe Probe",
    email: emailOf(id),
    emailVerified: true,
    pendingDeletionUntil: options.pendingDeletionUntil,
  });
  await db.insert(authSchema.session).values({
    id: `${id}-session`,
    userId: id,
    token: `${id}-token`,
    createdAt: new Date(Date.now() - options.sessionAgeMs),
    expiresAt: new Date(Date.now() + HOUR),
  });
  await db.insert(authSchema.account).values({
    id: `${id}-account`,
    userId: id,
    accountId: id,
    providerId: "google",
  });
}

async function seedOutbox(id: string): Promise<void> {
  await emitEvent(outbox, EventTypes.USER_CREATED, "user", id, {
    userId: id,
    email: emailOf(id),
    name: "Wipe Probe",
  });
  await emitEvent(outbox, EventTypes.SECURITY_RATE_LIMIT_EXCEEDED, "security", "global", {
    actorUserId: id,
    ip: "198.51.100.7",
    policyName: "probe",
    path: "/me/delete",
    method: "POST",
  });
}

async function userRow(id: string) {
  const [row] = await db
    .select({ pendingDeletionUntil: authSchema.user.pendingDeletionUntil })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, id))
    .limit(1);

  return row;
}

async function countOf(table: typeof authSchema.session | typeof authSchema.account, id: string) {
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.userId, id));

  return rows.length;
}

async function outboxRowsNaming(id: string) {
  const { outboxEvent } = outboxSchema;

  return db
    .select({ eventType: outboxEvent.eventType, payload: outboxEvent.payload })
    .from(outboxEvent)
    .where(
      or(
        eq(outboxEvent.aggregateId, id),
        sql`${outboxEvent.payload}->>'userId' = ${id}`,
        sql`${outboxEvent.payload}->>'actorUserId' = ${id}`,
      ),
    );
}

async function addFailingConstraint(): Promise<void> {
  await db.execute(sql`SET lock_timeout = '5s'`);
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
  const { outboxEvent } = outboxSchema;
  await dropFailingConstraint();
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, probeIds));
  await db.execute(
    sql`DELETE FROM email_message WHERE to_address IN (${sql.join(
      probeIds.map((id) => sql`${emailOf(id)}`),
      sql`, `,
    )})`,
  );
  for (const id of probeIds)
    await db
      .delete(outboxEvent)
      .where(
        or(
          eq(outboxEvent.aggregateId, id),
          sql`${outboxEvent.payload}->>'userId' = ${id}`,
          sql`${outboxEvent.payload}->>'actorUserId' = ${id}`,
        ),
      );
}

function buildService(): RgpdService {
  return new RgpdService(
    repository,
    childConnections,
    new QueuedEmailService(new DrizzleEmailQueue(instrumentation, logger), instrumentation),
    new TransactionService(instrumentation),
    outbox,
    instrumentation,
    {
      appUrl: env.APP_ORIGIN,
      gracePeriodDays: env.RGPD_GRACE_PERIOD_DAYS,
      freshSessionMaxAgeMs: 24 * HOUR,
      sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
    },
    logger,
  );
}

async function checkFailedWipeRollsBack(): Promise<void> {
  await seedUser(rolledBackId, {
    pendingDeletionUntil: new Date(Date.now() - 1000),
    sessionAgeMs: HOUR,
  });
  await seedOutbox(rolledBackId);
  await addFailingConstraint();

  const result = await buildService().executeAccountWipe({ userId: rolledBackId, now: new Date() });
  await dropFailingConstraint();

  check(
    "a failed confirmation enqueue fails the wipe with ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
    result.isFailure && result.getError().code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
  );
  check("the user row survives the rolled back wipe", (await userRow(rolledBackId)) !== undefined);
  check(
    "the session survives the rolled back wipe",
    (await countOf(authSchema.session, rolledBackId)) === 1,
  );
  const rows = await outboxRowsNaming(rolledBackId);
  check(
    "the outbox purge is rolled back with the wipe and USER_DELETED is not enqueued",
    rows.length === 2 && rows.every((r) => r.eventType !== EventTypes.USER_DELETED),
    rows.map((r) => r.eventType),
  );

  const ready = await repository.findUsersReadyForWipe(new Date(), 500);
  check(
    "the account is still picked up by the next sweep",
    ready.isSuccess && ready.getValue().some((r) => r.userId === rolledBackId),
  );
}

async function checkCompletedWipeErasesTheAccount(): Promise<void> {
  await seedUser(erasedId, {
    pendingDeletionUntil: new Date(Date.now() - 1000),
    sessionAgeMs: HOUR,
  });
  await seedOutbox(erasedId);
  await seedOutbox(bystanderId);
  revokedWhileUserExisted.length = 0;

  const result = await buildService().executeAccountWipe({ userId: erasedId, now: new Date() });

  check("the completed wipe reports success", result.isSuccess);
  check(
    "child tokens are revoked while the user still exists",
    JSON.stringify(revokedWhileUserExisted) === "[true]",
    revokedWhileUserExisted,
  );
  check("the user row is deleted", (await userRow(erasedId)) === undefined);
  check("its sessions are deleted", (await countOf(authSchema.session, erasedId)) === 0);
  check(
    "its accounts and sealed tokens are deleted",
    (await countOf(authSchema.account, erasedId)) === 0,
  );

  const rows = await outboxRowsNaming(erasedId);
  check(
    "only USER_DELETED remains in the outbox for the user",
    JSON.stringify(rows.map((r) => r.eventType)) === JSON.stringify([EventTypes.USER_DELETED]),
    rows.map((r) => r.eventType),
  );
  check(
    "USER_DELETED carries no email",
    rows.every((r) => !JSON.stringify(r.payload).includes("@")),
    rows,
  );
  check("another user's outbox rows are kept", (await outboxRowsNaming(bystanderId)).length === 2);
}

async function checkGracePeriodIsKept(): Promise<void> {
  await seedUser(graceId, {
    pendingDeletionUntil: new Date(Date.now() + HOUR),
    sessionAgeMs: HOUR,
  });

  const ready = await repository.findUsersReadyForWipe(new Date(), 500);

  check(
    "a pending deletion inside its grace period is not swept",
    ready.isSuccess && !ready.getValue().some((r) => r.userId === graceId),
  );
}

async function checkGoogleOnlyParentCanRequestDeletion(): Promise<void> {
  await seedUser(googleOnlyId, { pendingDeletionUntil: null, sessionAgeMs: 10 * 60_000 });
  await seedUser(staleId, { pendingDeletionUntil: null, sessionAgeMs: 25 * HOUR });
  const service = buildService();

  const fresh = await service.requestAccountDeletion({
    userId: googleOnlyId,
    sessionId: `${googleOnlyId}-session`,
  });
  check(
    "a Google-only parent with a fresh session schedules the deletion",
    fresh.isSuccess && (await userRow(googleOnlyId))?.pendingDeletionUntil instanceof Date,
    fresh.isFailure ? fresh.getError() : undefined,
  );

  const stale = await service.requestAccountDeletion({
    userId: staleId,
    sessionId: `${staleId}-session`,
  });
  check(
    "a stale session is asked to sign in again",
    stale.isFailure && stale.getError().code === "ACCOUNT_REAUTH_REQUIRED",
  );
  check(
    "the stale request schedules nothing",
    (await userRow(staleId))?.pendingDeletionUntil === null,
  );

  const foreign = await service.requestAccountDeletion({
    userId: staleId,
    sessionId: `${googleOnlyId}-session`,
  });
  check(
    "another user's fresh session does not count",
    foreign.isFailure && foreign.getError().code === "ACCOUNT_REAUTH_REQUIRED",
  );
}

async function main(): Promise<void> {
  await cleanup();

  console.log("[1] a failed wipe rolls back");
  await checkFailedWipeRollsBack();
  console.log("[2] a completed wipe erases the account and purges its outbox rows");
  await checkCompletedWipeErasesTheAccount();
  console.log("[3] the grace period is kept");
  await checkGracePeriodIsKept();
  console.log("[4] a Google-only parent can request the deletion");
  await checkGoogleOnlyParentCanRequestDeletion();

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-wipe-rollback crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
