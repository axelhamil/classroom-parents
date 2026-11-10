import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { and, emailSchema, eq, inArray, lt } from "@packages/drizzle";
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

const { emailMessage } = emailSchema;

function sentBefore(cutoff: Date) {
  return requireFilter(
    and(eq(emailMessage.status, "sent"), lt(emailMessage.sentAt, cutoff)),
    EMAIL_RETENTION_LABEL,
  );
}

function undeliveredBefore(cutoff: Date) {
  return requireFilter(
    and(inArray(emailMessage.status, ["failed", "dead"]), lt(emailMessage.createdAt, cutoff)),
    EMAIL_RETENTION_LABEL,
  );
}

function undeliveredEmailPass(
  retentionDays: number,
  spans: SweepSpans,
  uow: IUnitOfWork,
): RetentionPass {
  return {
    label: "undelivered",
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table: emailMessage,
        idColumn: emailMessage.id,
        where: undeliveredBefore(cutoff),
        orderBy: emailMessage.createdAt,
        batchSize,
        spans,
        uow,
      }),
    countEligible: (cutoff) =>
      countEligibleWithTimeout(emailMessage, undeliveredBefore(cutoff), spans, uow),
  };
}

function sentEmailPass(retentionDays: number, spans: SweepSpans, uow: IUnitOfWork): RetentionPass {
  return {
    label: "sent",
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table: emailMessage,
        idColumn: emailMessage.id,
        where: sentBefore(cutoff),
        orderBy: emailMessage.sentAt,
        batchSize,
        spans,
        uow,
      }),
    countEligible: (cutoff) =>
      countEligibleWithTimeout(emailMessage, sentBefore(cutoff), spans, uow),
  };
}

export interface EmailRetentionDeps {
  uow: IUnitOfWork;
  instrumentation: IInstrumentation;
  sweepRuns: ISweepRunStore;
  logger: Logger;
  retentionDays: number;
  deadlineMs?: number;
}

export function sweepOldEmails(deps: EmailRetentionDeps): Promise<SweepResponse> {
  const spans = sweepSpans(deps.instrumentation);

  return withSweepHeartbeat(
    {
      label: EMAIL_RETENTION_LABEL,
      store: deps.sweepRuns,
      spans,
      beatOf: beatOfSweep,
    },
    () =>
      runRetentionSweep({
        body: {},
        passes: [
          sentEmailPass(deps.retentionDays, spans, deps.uow),
          undeliveredEmailPass(deps.retentionDays, spans, deps.uow),
        ],
        logger: deps.logger,
        label: EMAIL_RETENTION_LABEL,
        deadlineMs: deps.deadlineMs,
        lock: sweepLockFor(EMAIL_RETENTION_LABEL, spans),
        spans,
      }),
  );
}
