import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import {
  type AnyPgColumn,
  type AnyPgTable,
  and,
  emailSchema,
  eq,
  inArray,
  isNotNull,
  lt,
  outboxSchema,
  type SQL,
} from "@packages/drizzle";
import { countEligibleWithTimeout } from "../shared/internal-routes/sweep-count";
import { beatOfSweep, withSweepHeartbeat } from "../shared/internal-routes/sweep-heartbeat";
import { sweepLockFor } from "../shared/internal-routes/sweep-lock";
import { purgeBatchWithTimeout, requireFilter } from "../shared/internal-routes/sweep-purge";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepResponse,
} from "../shared/internal-routes/sweep-runner";
import { type SweepSpans, sweepSpans } from "../shared/internal-routes/sweep-span";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";

export const EMAIL_RETENTION_LABEL = "sweep-email-messages";
export const OUTBOX_RETENTION_LABEL = "sweep-outbox-events";
export const OUTBOX_RETENTION_DAYS = 7;

const { emailMessage } = emailSchema;
const { outboxEvent } = outboxSchema;

interface PassTarget {
  label: string;
  sweep: string;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  orderBy: AnyPgColumn;
  before: (cutoff: Date) => SQL | undefined;
}

function retentionPass(
  target: PassTarget,
  retentionDays: number,
  spans: SweepSpans,
  uow: IUnitOfWork,
): RetentionPass {
  const where = (cutoff: Date) => requireFilter(target.before(cutoff), target.sweep);

  return {
    label: target.label,
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table: target.table,
        idColumn: target.idColumn,
        where: where(cutoff),
        orderBy: target.orderBy,
        batchSize,
        spans,
        uow,
      }),
    countEligible: (cutoff) => countEligibleWithTimeout(target.table, where(cutoff), spans, uow),
  };
}

const sentEmails: PassTarget = {
  label: "sent",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.sentAt,
  before: (cutoff) => and(eq(emailMessage.status, "sent"), lt(emailMessage.sentAt, cutoff)),
};

const undeliveredEmails: PassTarget = {
  label: "undelivered",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.createdAt,
  before: (cutoff) =>
    and(inArray(emailMessage.status, ["failed", "dead"]), lt(emailMessage.createdAt, cutoff)),
};

const erasableDeadEmails: PassTarget = {
  label: "erasable-dead",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.createdAt,
  before: (cutoff) =>
    and(
      eq(emailMessage.eraseOnSettle, true),
      eq(emailMessage.status, "dead"),
      lt(emailMessage.createdAt, cutoff),
    ),
};

const deliveredEvents: PassTarget = {
  label: "delivered",
  sweep: OUTBOX_RETENTION_LABEL,
  table: outboxEvent,
  idColumn: outboxEvent.id,
  orderBy: outboxEvent.dispatchedAt,
  before: (cutoff) =>
    and(isNotNull(outboxEvent.dispatchedAt), lt(outboxEvent.dispatchedAt, cutoff)),
};

export interface RetentionDeps {
  uow: IUnitOfWork;
  instrumentation: IInstrumentation;
  sweepRuns: ISweepRunStore;
  logger: Logger;
  deadlineMs?: number;
}

export interface EmailRetentionDeps extends RetentionDeps {
  retentionDays: number;
  deadReplayWindowHours: number;
}

function sweep(
  label: string,
  deps: RetentionDeps,
  passes: (spans: SweepSpans) => RetentionPass[],
): Promise<SweepResponse> {
  const spans = sweepSpans(deps.instrumentation);

  return withSweepHeartbeat({ label, store: deps.sweepRuns, spans, beatOf: beatOfSweep }, () =>
    runRetentionSweep({
      body: {},
      passes: passes(spans),
      logger: deps.logger,
      label,
      deadlineMs: deps.deadlineMs,
      lock: sweepLockFor(label, spans),
      spans,
    }),
  );
}

export function sweepOldEmails(deps: EmailRetentionDeps): Promise<SweepResponse> {
  return sweep(EMAIL_RETENTION_LABEL, deps, (spans) => [
    retentionPass(sentEmails, deps.retentionDays, spans, deps.uow),
    retentionPass(undeliveredEmails, deps.retentionDays, spans, deps.uow),
    retentionPass(erasableDeadEmails, deps.deadReplayWindowHours / 24, spans, deps.uow),
  ]);
}

export function sweepDeliveredOutbox(deps: RetentionDeps): Promise<SweepResponse> {
  return sweep(OUTBOX_RETENTION_LABEL, deps, (spans) => [
    retentionPass(deliveredEvents, OUTBOX_RETENTION_DAYS, spans, deps.uow),
  ]);
}
